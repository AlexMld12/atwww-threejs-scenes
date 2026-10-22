import * as THREE from 'three';
import { loadViewLut, VIEW_TRANSFORM, viewLut } from '../configurator/finishes';
import { createSunCookie, fromBlender, LIGHT, SUN_COOKIE } from './sun';

// A picture of the gallery (tools/blender_gallery.py): the product in the plaza, rendered as the hero's plaza is, two
// plates (sky, sun) and each pixel's distance from the camera. From the distance the shader finds where the pixel is,
// so the leaves' live shadow (the hero's own) falls on the sun's plate in the right place, the product included.
// All the pictures share one WebGL context (a browser keeps only a few: the oldest were lost, the wide picture first)
// and one leaves' shadow per frame; each is drawn there, then copied into its own 2D canvas.
// Nothing heavy happens on screen: the plates are decoded off the main thread, put on the GPU one a frame (with the
// shader's first compile) before the picture is shown, and the leaves are drawn at 30 frames a second.
const ASSETS = '/gallery/';

export interface GalleryView {
  matrix: number[][];
  vFov: number;
  size: [number, number];
  scales: { sky: number; sun: number };
  /** A crop of another view's camera (the cards of the front picture): its middle, in tan units off the axis. */
  centre?: [number, number];
}

const FRAGMENT = /* glsl */ `
${VIEW_TRANSFORM}
${SUN_COOKIE}
uniform sampler2D skyPlate;
uniform sampler2D sunPlate;
uniform sampler2D distanceMap;
uniform vec2 scales;
uniform mat4 cameraWorld;
uniform vec2 tanHalf;
uniform vec2 centre;
uniform float distanceMax;
varying vec2 vUv;
void main() {
  // the distance, 16 bits in two bytes
  vec2 packed = texture2D( distanceMap, vUv ).rg * 255.0;
  float distance = ( packed.r * 256.0 + packed.g ) / 65535.0 * distanceMax;
  vec3 ray = normalize( vec3( ( vUv * 2.0 - 1.0 ) * tanHalf + centre, -1.0 ) );
  vec3 world = cameraWorld[ 3 ].xyz + mat3( cameraWorld ) * ray * distance;
  vec3 sky = texture2D( skyPlate, vUv ).rgb * scales.x;
  vec3 sun = texture2D( sunPlate, vUv ).rgb * scales.y;
  gl_FragColor = vec4( viewTransform( sky + sun * sunCookie( world ) ), 1.0 );
}
`;

// Blender's camera (z-up) in three's axes
const Z_UP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

interface Picture {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  scene: THREE.Scene;
  onScreen: boolean;
}

interface Shared {
  renderer: THREE.WebGLRenderer;
  cookie: ReturnType<typeof createSunCookie>;
  pictures: Set<Picture>;
  /** Uploads waiting for a frame of their own, one each frame. */
  uploads: (() => void)[];
}

const FRAME = 1000 / 30;

let shared: Promise<Shared> | null = null;
// pictures made and not yet disposed, loaded or not
let users = 0;

function share() {
  shared ??= Promise.all([
    fetch('/plaza/plaza.json').then((r) => r.json() as Promise<{ sun: { towards: number[] } }>),
    viewLut.value ? null : loadViewLut('/configurator/view-lut.png'),
  ]).then(([plaza]) => {
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); // sizes are given in device pixels
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the view LUT already gives display values
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setScissorTest(true);
    const cookie = createSunCookie(fromBlender(plaza.sun.towards).normalize());
    const pictures = new Set<Picture>();
    const camera = new THREE.Camera();
    const size = new THREE.Vector2();
    // the leaves' shadow drawn once ahead, so its shader is compiled before any picture shows
    const uploads: (() => void)[] = [() => cookie.foliage.update(renderer, 0)];
    let drawn = -Infinity;
    renderer.setAnimationLoop((now) => {
      uploads.shift()?.();
      // a little early, so the screen's 60 or 120 frames give a steady 30
      if (now - drawn < FRAME - 4) return;
      const shown = [...pictures].filter((picture) => picture.onScreen && picture.canvas.width);
      if (!shown.length) return;
      drawn = now;
      cookie.foliage.update(renderer, now / 1000);
      // the drawing buffer as large as the largest picture; each drawn in its bottom-left corner, then copied
      const width = Math.max(...shown.map((picture) => picture.canvas.width));
      const height = Math.max(...shown.map((picture) => picture.canvas.height));
      renderer.getSize(size);
      if (size.x < width || size.y < height) renderer.setSize(Math.max(size.x, width), Math.max(size.y, height), false);
      renderer.getSize(size);
      for (const picture of shown) {
        const { width: w, height: h } = picture.canvas;
        renderer.setViewport(0, 0, w, h);
        renderer.setScissor(0, 0, w, h);
        renderer.render(picture.scene, camera);
        picture.context.drawImage(renderer.domElement, 0, size.y - h, w, h, 0, 0, w, h);
      }
    });
    return { renderer, cookie, pictures, uploads };
  });
  return shared;
}

/**
 * Draws a picture into `canvas` once its plates are in (`onReady`). The disposer is given at once, so a picture left
 * before its plates arrive never holds the shared context: the context goes with the last picture, loaded or not.
 */
export function createGalleryImage(
  canvas: HTMLCanvasElement,
  name: string,
  view: GalleryView,
  distanceMax: number,
  onReady: () => void,
) {
  // decoded off the main thread, already the right way up; the bytes as they are (the distance is data)
  const loader = new THREE.ImageBitmapLoader().setOptions({
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const plate = (kind: string) =>
    loader.loadAsync(`${ASSETS}${name}-${kind}.webp`).then((bitmap) => {
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = kind === 'distance' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      // the distance's bytes must not be blended between pixels
      texture.minFilter = texture.magFilter = kind === 'distance' ? THREE.NearestFilter : THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    });
  const free = (textures: THREE.Texture[]) =>
    textures.forEach((texture) => {
      texture.dispose();
      (texture.image as ImageBitmap).close();
    });
  let disposed = false;
  let release: (() => void) | undefined;
  users++;

  Promise.all([share(), plate('sky'), plate('sun'), plate('distance')])
    .then(([{ renderer, cookie, pictures, uploads }, skyPlate, sunPlate, distanceMap]) => {
      const textures = [skyPlate, sunPlate, distanceMap];
      if (disposed) return free(textures);
      const cameraWorld = new THREE.Matrix4()
        .set(...(view.matrix.flat() as Parameters<THREE.Matrix4['set']>))
        .premultiply(Z_UP);
      const tan = Math.tan(THREE.MathUtils.degToRad(view.vFov / 2));
      const material = new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
        fragmentShader: FRAGMENT,
        uniforms: {
          viewLut,
          ...cookie.cookie,
          skyPlate: { value: skyPlate },
          sunPlate: { value: sunPlate },
          distanceMap: { value: distanceMap },
          scales: { value: new THREE.Vector2(view.scales.sky * LIGHT.sky, view.scales.sun * LIGHT.sun) },
          cameraWorld: { value: cameraWorld },
          tanHalf: { value: new THREE.Vector2((tan * view.size[0]) / view.size[1], tan) },
          centre: { value: new THREE.Vector2(...(view.centre ?? [0, 0])) },
          distanceMax: { value: distanceMax },
        },
        depthTest: false,
        depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      const scene = new THREE.Scene();
      scene.add(quad);
      const picture: Picture = { canvas, context: canvas.getContext('2d')!, scene, onScreen: false };

      const resize = () => {
        const ratio = Math.min(window.devicePixelRatio, 2);
        canvas.width = Math.round(canvas.clientWidth * ratio);
        canvas.height = Math.round(canvas.clientHeight * ratio);
      };
      resize();
      const resizer = new ResizeObserver(resize);
      resizer.observe(canvas);
      const visibility = new IntersectionObserver((entries) => (picture.onScreen = entries.at(-1)!.isIntersecting));
      visibility.observe(canvas);
      // the plates onto the GPU and the shader compiled, a frame each; then the picture can be drawn
      const steps = [
        ...textures.map((texture) => () => renderer.initTexture(texture)),
        () => renderer.compile(scene, new THREE.Camera()),
        // the shared drawing buffer grown to this picture beforehand, not on its first frame
        () => {
          const size = renderer.getSize(new THREE.Vector2());
          if (size.x < canvas.width || size.y < canvas.height)
            renderer.setSize(Math.max(size.x, canvas.width), Math.max(size.y, canvas.height), false);
        },
        () => {
          pictures.add(picture);
          onReady();
        },
      ];
      const next = () => {
        if (disposed) return;
        steps.shift()!();
        if (steps.length) uploads.push(next);
      };
      uploads.push(next);

      release = () => {
        pictures.delete(picture);
        resizer.disconnect();
        visibility.disconnect();
        material.dispose();
        quad.geometry.dispose();
        free(textures);
      };
    })
    .catch((error) => console.error(error));

  return () => {
    if (disposed) return;
    disposed = true;
    release?.();
    // the last picture gone (another page): the context goes too, so contexts never pile up
    if (!--users && shared) {
      const gone = shared;
      shared = null;
      gone.then(({ renderer, cookie }) => {
        renderer.setAnimationLoop(null);
        cookie.foliage.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      });
    }
  };
}
