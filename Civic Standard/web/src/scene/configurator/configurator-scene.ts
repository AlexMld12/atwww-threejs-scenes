import CameraControls from 'camera-controls';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { designPx } from '@/lib/design';
import { createProductLoader, fromBlender, type Loaded } from './product';

CameraControls.install({ THREE });

export { ASSETS } from './product';

// Behaviour of the reference (MOTO Stack's configurator, CanvasRig): camera-controls with only rotation by the left
// button / one finger, default smoothing (0.125 s dragging, 0.25 s otherwise), speed 1 (a canvas height = 2π), and
// on release a smooth reset to the saved pose. Theirs may drop ~5° below the pose; here the pose is the lowest
// (the user: no dragging down). Parts swap at once, only the camera re-frames. The colour eases at 5/s as theirs.
// Their lens is 35°; Figma's renders are orthographic, so a longer lens keeps the product as Figma shows it.
const FOV = 20;
const COLOUR_RATE = 5;
const DRAG_HIDE_MS = 500;

// Figma (both frames): the product's box, seen along the catalogue camera, fits 666.5 × 498.6 px of the 850 px section
// (the bench is as wide, the bin as tall), its middle 4 px left of the section's and 6 px above. The dots sit 88 px
// out from the box's sides, the left one 30 px below its middle, the right one 50 px above.
const FIT = { width: 666.5, height: 498.6 };
const FIT_WIDTH_SHARE = 0.8; // of a narrow screen's width, at most
const SECTION_PX = 850;
const CENTRE_SHIFT = { x: -4, y: -6 };
const DOT_GAP = 88;
const DOT_DY = { left: 30, right: -50 };
const DOT_EDGE = 52;
const DOT_BELOW = 44;

export interface Anchors {
  left: { x: number; y: number };
  right: { x: number; y: number };
}

export async function createConfiguratorScene(
  canvas: HTMLCanvasElement,
  surface: HTMLElement,
  options: {
    first: string[];
    onProgress: (fraction: number) => void;
    onAnchors: (anchors: Anchors) => void;
    onDragging: (dragging: boolean) => void;
    /** Under 1024 px: how far up (px) the product sits, clear of the controls under it. */
    lift?: number;
  },
) {
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
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);

  const { load, stage, dispose: disposeProducts } = createProductLoader(renderer, scene, camera);

  let shown: Loaded | null = null;
  let colour = new THREE.Color();
  const colourTarget = new THREE.Color();

  const pose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const view = new THREE.Matrix4();
  const corner = new THREE.Vector3();
  function framing(loaded: Loaded) {
    const { meta, box } = loaded;
    const matrix = fromBlender(meta.camera.matrix);
    const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
    // the box's extent across the catalogue camera's view
    view.extractRotation(matrix).invert();
    const across = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      across.expandByPoint(corner.applyMatrix4(view));
    }
    const size = across.getSize(corner);
    const pxPerMetre = Math.min(FIT.width / size.x, FIT.height / size.y);
    const visible = SECTION_PX / pxPerMetre;
    const distance = visible / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    box.getCenter(pose.target);
    pose.position.copy(pose.target).addScaledVector(forward, -distance);
    return pose;
  }

  const controls = new CameraControls(camera, surface);
  const { ACTION } = CameraControls;
  controls.mouseButtons.left = ACTION.ROTATE;
  controls.mouseButtons.middle = ACTION.NONE;
  controls.mouseButtons.right = ACTION.NONE;
  controls.mouseButtons.wheel = ACTION.NONE;
  controls.touches.one = ACTION.TOUCH_ROTATE;
  // On a touch screen a drag over this full-height section must still scroll the page (mobile: not decided yet).
  if (window.matchMedia('(pointer: coarse)').matches) {
    controls.touches.one = ACTION.NONE;
    surface.style.touchAction = 'pan-y';
  }
  controls.touches.two = ACTION.NONE;
  controls.touches.three = ACTION.NONE;
  controls.smoothTime = 0.25;
  controls.draggingSmoothTime = 0.125;
  controls.azimuthRotateSpeed = 1;
  controls.polarRotateSpeed = 1;
  controls.minPolarAngle = 0;

  let dragTimer = 0;
  controls.addEventListener('controlstart', () => {
    window.clearTimeout(dragTimer);
    dragTimer = window.setTimeout(() => options.onDragging(true), DRAG_HIDE_MS);
  });
  controls.addEventListener('controlend', () => {
    window.clearTimeout(dragTimer);
    options.onDragging(false);
    controls.reset(true);
  });

  let dirty = true;
  async function show(id: string) {
    const loaded = await load(id);
    if (shown === loaded) return;
    const first = !shown;
    if (shown) shown.group.visible = false;
    shown = loaded;
    loaded.group.visible = true;
    loaded.painted.forEach((material) => material.color.copy(colour));
    stage(loaded.meta);
    scene.environment = loaded.environment;
    const { position, target } = framing(loaded);
    controls.maxPolarAngle = Math.PI;
    await Promise.all([
      controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, !first),
      (() => {
        // the pose is the lowest view: dragging only lifts the camera
        const offset = position.clone().sub(target);
        const polar = Math.acos(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1));
        controls.maxPolarAngle = polar + 1e-4;
        controls.saveState();
      })(),
    ]);
    dirty = true;
  }

  function setColour(hex: string, instant = false) {
    colourTarget.set(hex);
    if (instant) colour = colourTarget.clone();
    dirty = true;
  }

  // ── size: the clamp rule, the frame's centre where Figma has it ─────────────────────────────────────────────
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // The section is the screen's height. Shorter than Figma's 850 (or narrow), the product shrinks with it so it
    // stays between the rules; taller, it keeps Figma's scale and the screen sees more around it.
    const fit = Math.min(1, height / designPx(SECTION_PX), (width * FIT_WIDTH_SHARE) / designPx(FIT.width));
    const seen = height / (designPx(SECTION_PX) * fit);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * seen));
    const lift = width < 1024 ? (options.lift ?? 0) : 0;
    camera.setViewOffset(width, height, -designPx(CENTRE_SHIFT.x), -designPx(CENTRE_SHIFT.y) + lift, width, height);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  resize();
  const resizer = new ResizeObserver(resize);
  resizer.observe(canvas);

  let onScreen = false;
  const visibility = new IntersectionObserver((entries) => (onScreen = entries.at(-1)!.isIntersecting));
  visibility.observe(canvas);

  // the dots: beside the product's sides as the screen shows them
  function anchors() {
    if (!shown) return;
    const { box } = shown;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      corner.project(camera);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const middle = ((1 - (minY + maxY) / 2) / 2) * height;
    // a phone: no room beside the product, the two under it, apart
    if (width < 744) {
      const below = ((1 - minY) / 2) * height + DOT_BELOW;
      options.onAnchors({ left: { x: width * 0.3, y: below }, right: { x: width * 0.7, y: below } });
      return;
    }
    // a narrow screen: kept on it (the circle and its label inside the edges)
    const keep = (x: number) => Math.min(width - DOT_EDGE, Math.max(DOT_EDGE, x));
    options.onAnchors({
      left: { x: keep(((minX + 1) / 2) * width - designPx(DOT_GAP)), y: middle + designPx(DOT_DY.left) },
      right: { x: keep(((maxX + 1) / 2) * width + designPx(DOT_GAP)), y: middle + designPx(DOT_DY.right) },
    });
  }

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!onScreen || !shown) return;
    const moved = controls.update(dt);
    let tinting = false;
    if (!colour.equals(colourTarget)) {
      const k = Math.min(1, COLOUR_RATE * dt);
      colour.r += (colourTarget.r - colour.r) * k;
      colour.g += (colourTarget.g - colour.g) * k;
      colour.b += (colourTarget.b - colour.b) * k;
      if (
        Math.abs(colour.r - colourTarget.r) +
          Math.abs(colour.g - colourTarget.g) +
          Math.abs(colour.b - colourTarget.b) <
        1e-4
      ) {
        colour.copy(colourTarget);
      }
      shown.painted.forEach((material) => material.color.copy(colour));
      tinting = true;
    }
    if (!moved && !tinting && !dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    anchors();
  });

  // the first products while the preloader runs, the rest after, one by one
  const firstShares = options.first.map(() => 0);
  await Promise.all(
    options.first.map((id, i) =>
      load(id, (fraction) => {
        firstShares[i] = fraction;
        options.onProgress(firstShares.reduce((a, b) => a + b) / firstShares.length);
      }),
    ),
  );

  return {
    show,
    setColour,
    /**
     * The rest, one by one, once the section is near (1.5 screens): not while the hero's glass is on screen, and not
     * while `paused` (the section's page hidden under another: its loads would cost that page's frames).
     */
    preload(ids: string[], paused: () => boolean = () => false) {
      const free = () =>
        new Promise<void>((resolve) => {
          const check = () => (paused() ? window.setTimeout(check, 500) : resolve());
          check();
        });
      const near = new IntersectionObserver(
        (entries) => {
          if (!entries.at(-1)!.isIntersecting) return;
          near.disconnect();
          ids.reduce<Promise<unknown>>(
            (chain, id) => chain.then(free).then(() => load(id).catch(() => undefined)),
            Promise.resolve(),
          );
        },
        { rootMargin: '150% 0px' },
      );
      near.observe(canvas);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.clearTimeout(dragTimer);
      controls.dispose();
      resizer.disconnect();
      visibility.disconnect();
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
