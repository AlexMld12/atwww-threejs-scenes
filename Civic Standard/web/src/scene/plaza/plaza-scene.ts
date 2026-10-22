import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ASSETS as PRODUCTS } from '../configurator/configurator-scene';
import { dress, loadFinishes, VIEW_TRANSFORM, viewLut } from '../configurator/finishes';
import { loadBitmap, uploadTextures } from '../upload';
import { createSunCookie, fromBlender, LIGHT, SUN_COOKIE } from './sun';

// The product page's hero: the product in 3D on the plaza (tools/blender_plaza.py). The plaza is two plates from
// Blender, one per light, laid on its own boxes from Blender's camera; so the sun's part can be shaded live: by the
// leaves' moving shadow (foliage.ts) and by the product's, from its silhouette seen from the sun. The product has the
// configurator's materials, lit by the same sun (with the leaves on it) and by the plaza seen from its seat.
const ASSETS = '/plaza/';

// Motion: the camera eases back from nearer to Blender's pose as the page comes in, then leans a little with the
// pointer. The arrow turns the product by a sixth of a turn.
const INTRO = { seconds: 2.8, push: 0.55, lift: 0.08 };
// the share of Figma's frame width a narrow screen still shows across (the product sits in its middle)
const PORTRAIT_SHARE = 0.68;
const LEAN = { x: 0.09, y: 0.04, rate: 2.5 };
const TURN = { step: Math.PI / 3, seconds: 1.6 };
const COLOUR_RATE = 5;
// How much the studio's contact shadow takes from the sky's light under the product.
const CONTACT = 0.75;
// The product's silhouette from the sun: its area (metres across, around the product) and the penumbra's radius.
const SILHOUETTE = { span: 3.2, soft: 0.014 };

interface Meta {
  frame: [number, number];
  plate: [number, number];
  vFov: number;
  camera: { position: number[]; target: number[] };
  sun: { towards: number[]; strength: number; colour: number[] };
  proxies: { name: string; min: number[]; max: number[] }[];
  scales: { sky: number; sun: number };
}

interface ProductMeta {
  bounds: [number[], number[]];
  shadow: { centre: [number, number]; size: number };
}

const expoInOut = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

// uv = (clip.xy / w) / 2 + 1/2: the bias folded into a matrix, so a shader needs one product and one division
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);

const PLATE_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const PLATE_FRAGMENT = /* glsl */ `
${VIEW_TRANSFORM}
${SUN_COOKIE}
uniform sampler2D skyPlate;
uniform sampler2D sunPlate;
uniform sampler2D silhouette;
uniform sampler2D contact;
uniform mat4 plateMatrix;
uniform mat4 silhouetteMatrix;
uniform mat4 contactMatrix;
uniform vec2 scales;
varying vec3 vWorld;

float inside( vec2 uv ) {
  return step( 0.0, uv.x ) * step( 0.0, uv.y ) * step( uv.x, 1.0 ) * step( uv.y, 1.0 );
}

void main() {
  vec4 clip = plateMatrix * vec4( vWorld, 1.0 );
  vec2 uv = clamp( clip.xy / clip.w, 0.0, 1.0 );
  vec3 sky = texture2D( skyPlate, uv ).rgb * scales.x;
  vec3 sun = texture2D( sunPlate, uv ).rgb * scales.y;
  // the product's shadow: its silhouette from the sun (all of this plaza lies behind it, seen from there)
  vec2 s = ( silhouetteMatrix * vec4( vWorld, 1.0 ) ).xy;
  float covered = texture2D( silhouette, s ).r;
  for ( int i = 0; i < 8; i++ ) {
    float a = float( i ) * 0.785398 + 0.39;
    covered += texture2D( silhouette, s + vec2( cos( a ), sin( a ) ) * ${(SILHOUETTE.soft / SILHOUETTE.span).toFixed(5)} ).r;
    covered += texture2D( silhouette, s + vec2( cos( a + 0.39 ), sin( a + 0.39 ) ) * ${(SILHOUETTE.soft / SILHOUETTE.span / 2).toFixed(5)} ).r;
  }
  float shade = 1.0 - covered / 17.0 * inside( s );
  vec2 c = ( contactMatrix * vec4( vWorld, 1.0 ) ).xy;
  float occlusion = 1.0 - texture2D( contact, c ).g * inside( c ) * ${CONTACT.toFixed(2)};
  vec3 colour = sky * occlusion + sun * sunCookie( vWorld ) * shade;
  gl_FragColor = vec4( viewTransform( colour ), 1.0 );
}
`;

/** The configurator's materials, plus the leaves on the sun's light. */
function withCookie(material: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>) {
  const dressed = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    dressed(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'varying vec3 vPlazaWorld;\n#include <common>')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPlazaWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `varying vec3 vPlazaWorld;\n${SUN_COOKIE}\n#include <common>`)
      .replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sunCookie( vPlazaWorld );',
        ),
      );
  };
  material.customProgramCacheKey = () => `${key}-plaza`;
  material.needsUpdate = true;
}

const GHOST_FRAGMENT = /* glsl */ `
${SUN_COOKIE}
uniform sampler2D render;
uniform vec3 colour;
uniform vec4 crop;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  // the product without its soft shadow: only the render's near-opaque pixels
  float alpha = smoothstep( 0.82, 0.97, texture2D( render, crop.xy + vUv * crop.zw ).a );
  if ( alpha < 0.01 ) discard;
  // flat in its colour, the leaves still passing over it
  gl_FragColor = vec4( sRGBTransferOETF( vec4( colour * ( 0.82 + 0.18 * sunCookie( vWorld ) ), 1.0 ) ).rgb, alpha );
}
`;

/**
 * A product without its model: its catalogue render's outline, flat in the chosen colour, standing at the product's
 * place.
 */
function silhouetteOf(render: THREE.Texture, dimensions: number[], cookie: Record<string, THREE.IUniform>) {
  const image = render.image as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let [minX, minY, maxX, maxY] = [image.width, image.height, 0, 0];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (pixels[(y * image.width + x) * 4 + 3] < 210) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const crop = new THREE.Vector4(
    minX / image.width,
    1 - (maxY + 1) / image.height,
    (maxX - minX + 1) / image.width,
    (maxY - minY + 1) / image.height,
  );
  // as wide as the product is long, but no taller than it stands (the render sees it from above: its depth adds)
  const aspect = (maxY - minY + 1) / (maxX - minX + 1);
  const height = Math.min(
    (Math.max(dimensions[0], dimensions[1]) / 1000) * 0.95 * aspect,
    (dimensions[2] / 1000) * 1.35,
  );
  const width = height / aspect;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height / 2, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: GHOST_FRAGMENT,
    uniforms: { ...cookie, render: { value: render }, colour: { value: new THREE.Color() }, crop: { value: crop } },
    transparent: true,
  });
  return new THREE.Mesh(geometry, material);
}

export async function createPlazaScene(
  canvas: HTMLCanvasElement,
  options: {
    product: string;
    dimensions: number[];
    colour: string;
    onProgress: (fraction: number) => void;
  },
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // photographic plates: 1.5 device px a px is as sharp as they are, and a third of 2's pixels to draw
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the view LUT already gives display values
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // the product's shadow changes only as it turns: drawn then, not every frame
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const textureLoader = new THREE.TextureLoader();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- not a hook: the decoder's worker pool
  MeshoptDecoder.useWorkers(2);
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const shares = [0, 0, 0];
  const report = (i: number) => (event: ProgressEvent) => {
    if (event.total) shares[i] = event.loaded / event.total;
    options.onProgress((shares[0] * 4 + shares[1] * 2 + shares[2] * 2) / 8);
  };
  // the plates (3600 px) decoded off the main thread; uploaded before the first frame (below)
  const plate = (name: string, i: number) =>
    loadBitmap(`${ASSETS}${name}.webp`).then((texture) => {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      shares[i] = 1;
      return texture;
    });

  const products = fetch(PRODUCTS + 'products.json').then((r) => r.json() as Promise<Record<string, ProductMeta>>);
  // a product without its 3D model yet stands as its silhouette, cut from its catalogue render
  const model = products.then((all) =>
    all[options.product]
      ? Promise.all([
          gltfLoader.loadAsync(`${PRODUCTS}${options.product}.glb`, report(0)),
          textureLoader.loadAsync(`${PRODUCTS}${options.product}-ao.webp`),
          textureLoader.loadAsync(`${PRODUCTS}${options.product}-shadow.webp`),
          loadFinishes(PRODUCTS, textureLoader),
        ]).then(([gltf, ao, contact, details]) => ({ meta: all[options.product], gltf, ao, contact, details }))
      : null,
  );
  const [meta, loaded, render, skyPlate, sunPlate, environment] = await Promise.all([
    fetch(ASSETS + 'plaza.json').then((r) => r.json() as Promise<Meta>),
    model,
    model.then((m) => (m ? null : textureLoader.loadAsync(`/products/${options.product}.webp`, report(0)))),
    plate('sky', 1),
    plate('sun', 2),
    new HDRLoader().loadAsync(ASSETS + 'env.hdr'),
  ]);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(environment).texture;
  scene.environmentIntensity = LIGHT.sky;
  environment.dispose();

  // ── the camera: Blender's, its vertical view over Figma's 732 px (the hero's height under the clamp rule) ──────
  const rest = { position: fromBlender(meta.camera.position), target: fromBlender(meta.camera.target) };
  const camera = new THREE.PerspectiveCamera(meta.vFov, 1, 0.05, 200);
  const plateCamera = new THREE.PerspectiveCamera(
    THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(meta.vFov / 2)) * (meta.plate[1] / meta.frame[1])),
    ),
    meta.plate[0] / meta.plate[1],
    0.05,
    200,
  );
  plateCamera.position.copy(rest.position);
  plateCamera.lookAt(rest.target);
  plateCamera.updateMatrixWorld();
  const plateMatrix = BIAS.clone().multiply(plateCamera.projectionMatrix).multiply(plateCamera.matrixWorldInverse);

  // ── the sun, and its two views: the leaves over the plaza, the product's silhouette ─────────────────────────────
  const towards = fromBlender(meta.sun.towards).normalize();
  const sunColour = new THREE.Color().setRGB(meta.sun.colour[0], meta.sun.colour[1], meta.sun.colour[2]);
  const sun = new THREE.DirectionalLight(sunColour, meta.sun.strength * LIGHT.sun);
  sun.position.copy(towards).multiplyScalar(10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 5, far: 15 });
  scene.add(sun, sun.target);

  const { sunView, foliage, cookie } = createSunCookie(towards);

  // the product's silhouette from the sun, fitted to it; drawn again only when it turns
  const silhouette = new THREE.WebGLRenderTarget(1024, 1024, { samples: 4, depthBuffer: true });
  const half = SILHOUETTE.span / 2;
  const silhouetteView = new THREE.OrthographicCamera(-half, half, half, -half, 1, 60);
  silhouetteView.position.copy(sunView.position);
  silhouetteView.quaternion.copy(sunView.quaternion);
  silhouetteView.updateMatrixWorld();
  silhouetteView.layers.set(1);
  const silhouetteMatrix = new THREE.Matrix4();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // ── the plaza: Blender's boxes, the plates laid on them from Blender's camera ─────────────────────────────────────
  const contactMatrix = new THREE.Matrix4();
  const plateMaterial = new THREE.ShaderMaterial({
    vertexShader: PLATE_VERTEX,
    fragmentShader: PLATE_FRAGMENT,
    uniforms: {
      viewLut,
      ...cookie,
      skyPlate: { value: skyPlate },
      sunPlate: { value: sunPlate },
      silhouette: { value: silhouette.texture },
      contact: { value: null },
      plateMatrix: { value: plateMatrix },
      silhouetteMatrix: { value: silhouetteMatrix },
      contactMatrix: { value: contactMatrix },
      scales: { value: new THREE.Vector2(meta.scales.sky * LIGHT.sky, meta.scales.sun * LIGHT.sun) },
    },
  });
  for (const proxy of meta.proxies) {
    const box = new THREE.Box3().setFromPoints([fromBlender(proxy.min), fromBlender(proxy.max)]);
    const size = box.getSize(new THREE.Vector3());
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), plateMaterial);
    box.getCenter(mesh.position);
    scene.add(mesh);
  }

  // ── the product ─────────────────────────────────────────────────────────────────────────────────────────────
  const turntable = new THREE.Group();
  scene.add(turntable);
  const colour = new THREE.Color(options.colour);
  const colourTarget = colour.clone();
  let painted: { color: THREE.Color }[] = [];
  // the studio's contact shadow, on the paving under the product, turning with it (none under a silhouette)
  const toContact = new THREE.Matrix4().makeTranslation(-10, -10, 0);
  const textures: THREE.Texture[] = [skyPlate, sunPlate];

  if (loaded) {
    const { gltf, ao, contact, details } = loaded;
    ao.flipY = false; // glTF uvs
    ao.colorSpace = THREE.NoColorSpace;
    plateMaterial.uniforms.contact.value = contact;
    painted = dress(gltf.scene, ao, details);
    gltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = child.receiveShadow = true;
      child.layers.enable(1);
      withCookie(child.material as THREE.MeshStandardMaterial, cookie);
    });
    turntable.add(gltf.scene);
    const { centre, size } = loaded.meta.shadow;
    // prettier-ignore
    toContact.set(
      1 / size, 0, 0, 0.5 - centre[0] / size,
      0, 0, -1 / size, 0.5 - centre[1] / size,
      0, 1, 0, 0,
      0, 0, 0, 1,
    );
    textures.push(ao, contact);
  } else if (render) {
    const ghost = silhouetteOf(render, options.dimensions, cookie);
    ghost.rotation.y = Math.atan2(rest.position.x, rest.position.z); // facing the camera
    turntable.add(ghost);
    painted = [{ color: ghost.material.uniforms.colour.value }];
    textures.push(render);
  }
  painted.forEach((material) => material.color.copy(colour));

  let silhouetteDirty = true;
  function drawSilhouette() {
    turntable.updateMatrixWorld();
    contactMatrix.copy(toContact).multiply(turntable.matrixWorld.clone().invert());
    silhouetteMatrix.copy(BIAS).multiply(silhouetteView.projectionMatrix).multiply(silhouetteView.matrixWorldInverse);
    const background = scene.background;
    scene.overrideMaterial = white;
    renderer.setRenderTarget(silhouette);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, silhouetteView);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;
    scene.background = background;
    silhouetteDirty = false;
  }

  await uploadTextures(renderer, scene);
  await renderer.compileAsync(scene, camera);

  // ── size: the vertical view is Figma's frame at any width (the hero's height follows the clamp rule) ───────────
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // a screen narrower than the frame (a phone upright): wide enough to hold the product, as the frame's middle
    // PORTRAIT_SHARE does, at the cost of height (the vertical view grows)
    const frameTan = Math.tan(THREE.MathUtils.degToRad(meta.vFov / 2));
    const wanted = (frameTan * meta.frame[0] * PORTRAIT_SHARE) / meta.frame[1];
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(frameTan, wanted / camera.aspect)));
    camera.updateProjectionMatrix();
  };
  resize();
  const resizer = new ResizeObserver(resize);
  resizer.observe(canvas);

  let onScreen = true;
  const visibility = new IntersectionObserver((entries) => (onScreen = entries.at(-1)!.isIntersecting));
  visibility.observe(canvas);

  const pointer = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer);

  const forward = rest.target.clone().sub(rest.position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  let introStart = -1;
  let foliageAt = -Infinity;
  const turn = { from: 0, to: 0, start: -1 };

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    const time = timer.getElapsed();
    if (!onScreen) return;

    // the camera: the intro's way back, then the pointer's lean
    const intro = introStart < 0 ? 0 : expoOut(Math.min(1, (time - introStart) / INTRO.seconds));
    const k = 1 - Math.exp(-LEAN.rate * dt);
    lean.x += (pointer.x - lean.x) * k;
    lean.y += (pointer.y - lean.y) * k;
    camera.position
      .copy(rest.position)
      .addScaledVector(forward, INTRO.push * (1 - intro))
      .addScaledVector(up, INTRO.lift * (1 - intro))
      .addScaledVector(right, lean.x * LEAN.x * intro)
      .addScaledVector(up, -lean.y * LEAN.y * intro);
    camera.lookAt(rest.target);

    if (turn.start >= 0) {
      const t = Math.min(1, (time - turn.start) / TURN.seconds);
      turntable.rotation.y = THREE.MathUtils.lerp(turn.from, turn.to, expoInOut(t));
      if (t >= 1) turn.start = -1;
      silhouetteDirty = true;
      renderer.shadowMap.needsUpdate = true;
    }
    if (!colour.equals(colourTarget)) {
      colour.lerp(colourTarget, Math.min(1, COLOUR_RATE * dt));
      if (
        Math.abs(colour.r - colourTarget.r) +
          Math.abs(colour.g - colourTarget.g) +
          Math.abs(colour.b - colourTarget.b) <
        1e-4
      )
        colour.copy(colourTarget);
      painted.forEach((material) => material.color.copy(colour));
    }

    if (silhouetteDirty) drawSilhouette();
    // the leaves sway slowly: their shadow at 30 frames a second is enough
    if (time - foliageAt >= 1 / 30) {
      foliageAt = time;
      foliage.update(renderer, time);
    }
    renderer.render(scene, camera);
  });

  return {
    /** False for a product shown as its silhouette: nothing to turn. */
    hasModel: !!loaded,
    /** The page came in: the camera eases back to its pose. */
    enter() {
      introStart = timer.getElapsed();
    },
    setColour(hex: string) {
      colourTarget.set(hex);
    },
    /** The arrow: the product turns on to its next view. */
    next() {
      turn.from = turntable.rotation.y;
      turn.to = (turn.start >= 0 ? turn.to : turn.from) + TURN.step;
      turn.start = timer.getElapsed();
    },
    /** `release`: false when the canvas lives on (a scene dropped before it was used), its context with it. */
    dispose(release = true) {
      renderer.setAnimationLoop(null);
      window.removeEventListener('pointermove', onPointer);
      resizer.disconnect();
      visibility.disconnect();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      foliage.dispose();
      silhouette.dispose();
      white.dispose();
      textures.forEach((texture) => texture.dispose());
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (release) renderer.forceContextLoss(); // free the context now: a browser keeps only a few
    },
  };
}
