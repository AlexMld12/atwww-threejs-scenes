import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { designPx } from '@/lib/design';
import { createProductLoader, fromBlender } from './configurator/product';

// The product page's showcase (Figma 2857–5589, after pedestal.com's "Colors for your mood"): the product in its
// studio, seen by the catalogue's own camera (orthographic, as Figma's render: 1075 px for the camera's width), turned
// by the scroll. Theirs is a 4 s turntable video scrubbed by the scroll; here the product itself turns, a full turn.
// Figma's scale at most: smaller if the product, at any angle of its turn, would not fit in FIT of the screen (a tall
// bin on a short screen, a long bench on a narrow one); it turns about its middle, at the screen's middle.
const RENDER_PX = 1075;
const FIT = { width: 0.8, height: 0.72 };
const TURN_SAMPLES = 24;
const COLOUR_RATE = 5;

export async function createShowcaseScene(canvas: HTMLCanvasElement, options: { product: string; colour: string }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the view LUT already gives display values
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100);
  const { load, stage, dispose } = createProductLoader(renderer, scene, camera);
  const loaded = await load(options.product);
  loaded.group.visible = true;
  stage(loaded.meta);
  scene.environment = loaded.environment;
  fromBlender(loaded.meta.camera.matrix).decompose(camera.position, camera.quaternion, camera.scale);
  camera.scale.set(1, 1, 1);
  const metresPerPx = loaded.meta.camera.orthoScale / RENDER_PX;
  camera.updateMatrixWorld();

  // what the turn sweeps, across the camera's view
  const swept = new THREE.Box3();
  const corner = new THREE.Vector3();
  const turn = new THREE.Matrix4();
  const { box } = loaded;
  for (let k = 0; k < TURN_SAMPLES; k++) {
    turn.makeRotationY((k / TURN_SAMPLES) * Math.PI * 2).premultiply(camera.matrixWorldInverse);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      swept.expandByPoint(corner.applyMatrix4(turn));
    }
  }
  const sweptSize = swept.getSize(new THREE.Vector3());
  const sweptMiddle = swept.getCenter(new THREE.Vector3());

  const colour = new THREE.Color(options.colour);
  const colourTarget = colour.clone();
  loaded.painted.forEach((material) => material.color.copy(colour));

  let dirty = true;
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    // the clamp rule (Figma's scale up to 1720 px wide, then it grows with the screen), unless the turn would not fit
    const perPx = Math.max(
      metresPerPx / designPx(1),
      sweptSize.x / (FIT.width * width),
      sweptSize.y / (FIT.height * height),
    );
    const halfWidth = (width * perPx) / 2;
    const halfHeight = (height * perPx) / 2;
    Object.assign(camera, {
      left: sweptMiddle.x - halfWidth,
      right: sweptMiddle.x + halfWidth,
      top: sweptMiddle.y + halfHeight,
      bottom: sweptMiddle.y - halfHeight,
    });
    camera.updateProjectionMatrix();
    dirty = true;
  };
  resize();
  const resizer = new ResizeObserver(resize);
  resizer.observe(canvas);

  let onScreen = false;
  const visibility = new IntersectionObserver((entries) => (onScreen = entries.at(-1)!.isIntersecting));
  visibility.observe(canvas);

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!colour.equals(colourTarget)) {
      colour.lerp(colourTarget, Math.min(1, COLOUR_RATE * dt));
      const left =
        Math.abs(colour.r - colourTarget.r) + Math.abs(colour.g - colourTarget.g) + Math.abs(colour.b - colourTarget.b);
      if (left < 1e-4) colour.copy(colourTarget);
      loaded.painted.forEach((material) => material.color.copy(colour));
      dirty = true;
    }
    if (!onScreen || !dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  });

  return {
    /** 0 → 1 through the section: a full turn. */
    setTurn(progress: number) {
      const angle = progress * Math.PI * 2;
      if (angle === loaded.group.rotation.y) return;
      loaded.group.rotation.y = angle;
      dirty = true;
    },
    setColour(hex: string) {
      colourTarget.set(hex);
    },
    dispose(release = true) {
      renderer.setAnimationLoop(null);
      resizer.disconnect();
      visibility.disconnect();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      dispose();
      renderer.dispose();
      if (release) renderer.forceContextLoss(); // free the context now: a browser keeps only a few
    },
  };
}
