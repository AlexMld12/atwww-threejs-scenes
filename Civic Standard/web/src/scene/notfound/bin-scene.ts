import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { pixelRatio } from '@/lib/device';
import { createProductLoader, fromBlender } from '../configurator/product';

// The 404's "0": the recycling station in the colleague's studio (the configurator's loader), seen by its catalogue
// camera, orthographic as Figma's render (Page 404.pdf); it does not turn. It is framed on `target`, the box its
// silhouette has in Figma, wherever the layout puts that box.
const PRODUCT = 'K3_Q600';
const ANTHRACITE = '#383E42';
// The entrance: it comes down onto its shadow, which darkens as it lands (the site's rise: 1.6 s expo out).
const DROP = 0.35; // m
const LAND_S = 1.6;
const easeOut = (t: number) => 1 - (1 - t) ** 4;

export async function createBinScene(canvas: HTMLCanvasElement, target: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the view LUT already gives display values
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100);
  const { load, stage, dispose: disposeProducts } = createProductLoader(renderer, scene, camera);

  const loaded = await load(PRODUCT);
  const colour = new THREE.Color(ANTHRACITE);
  loaded.painted.forEach((material) => material.color.copy(colour));
  stage(loaded.meta);
  scene.environment = loaded.environment;
  fromBlender(loaded.meta.camera.matrix).decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld();

  // the silhouette's extent in the camera's plane (m), from the model's vertices, not its box: the roof slopes
  const ground = loaded.group.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
  const shade = ground.material as THREE.MeshBasicMaterial;
  const extent = new THREE.Box3();
  const point = new THREE.Vector3();
  loaded.group.updateMatrixWorld(true);
  loaded.group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child === ground) return;
    const position = child.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      extent.expandByPoint(point);
    }
  });
  const middle = extent.getCenter(new THREE.Vector3());
  const tall = extent.max.y - extent.min.y;

  let dirty = true;
  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const frame = canvas.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const perPx = tall / box.height;
    const x = box.left + box.width / 2 - frame.left;
    const y = box.top + box.height / 2 - frame.top;
    camera.left = middle.x - x * perPx;
    camera.right = camera.left + width * perPx;
    camera.top = middle.y + y * perPx;
    camera.bottom = camera.top - height * perPx;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  resize();
  const resizer = new ResizeObserver(resize);
  resizer.observe(canvas);
  resizer.observe(target);

  const product = loaded.group.children.filter((child) => child !== ground);
  let landing = 0;
  const place = (t: number) => {
    const lift = DROP * (1 - easeOut(t));
    product.forEach((child) => (child.position.y = lift));
    shade.opacity = easeOut(t);
  };
  place(0);
  loaded.group.visible = true;

  let falling = false;
  let last = 0;
  renderer.setAnimationLoop((now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (falling) {
      landing = Math.min(1, landing + dt / LAND_S);
      place(landing);
      falling = landing < 1;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  });

  return {
    /** Comes down onto its place (the page's entrance); `instant` puts it there at once. */
    land(instant = false) {
      landing = instant ? 1 : landing;
      place(landing);
      falling = landing < 1;
      dirty = true;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resizer.disconnect();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      disposeProducts();
      renderer.dispose();
    },
  };
}
