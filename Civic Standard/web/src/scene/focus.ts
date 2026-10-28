import * as THREE from 'three';
import { CAMERA, PROJECTS, TUBE } from './config';
import { pxPerUnit } from './framing';
import type { Panel } from './tube';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FRONT = new THREE.Vector3(0, 0, TUBE.radius);
const FACING = new THREE.Quaternion();
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const normal = new THREE.Vector3();
const from = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
// a square render as a panel crops it (CSS cover on 0.72 × 1)
const PANEL_CROP = { repeat: [TUBE.panelWidth / TUBE.panelHeight, 1], offset: [(1 - TUBE.panelWidth) / 2, 0] };

// Two pictures and a wipe between them (the panel's arrows): the new one comes in from the side it was asked from,
// over a soft edge, drifting the last few percent into place.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D mapA;
  uniform sampler2D mapB;
  uniform vec2 uvRepeat;
  uniform vec2 uvOffset;
  uniform float wipe;
  uniform float direction;
  uniform vec2 viewSpan;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv * uvRepeat + uvOffset;
    vec4 colour = texture2D(mapA, uv);
    if (wipe > 0.0) {
      // across what shows of it (left of the panel), not the whole card
      float across = (vUv.x - viewSpan.x) / viewSpan.y;
      float along = direction > 0.0 ? 1.0 - across : across;
      float reach = wipe * 1.2;
      float shown = 1.0 - smoothstep(reach - 0.2, reach, along);
      vec4 next = texture2D(mapB, uv + vec2(direction * (1.0 - wipe) * 0.04 * uvRepeat.x, 0.0));
      colour = mix(colour, next, shown);
    }
    gl_FragColor = colour;
    #include <colorspace_fragment>
  }
`;

/**
 * /projects: the picture clicked, once the tube has brought it to the front, grows to the full screen; closing runs
 * it back into its panel. Full screen it fits the part of the screen the project's panel leaves (`setView`): the
 * whole render shows there, and it runs on under the panel to the screen's edges.
 */
export function createFocus() {
  const uniforms = {
    mapA: { value: null as THREE.Texture | null },
    mapB: { value: null as THREE.Texture | null },
    uvRepeat: { value: new THREE.Vector2(1, 1) },
    uvOffset: { value: new THREE.Vector2() },
    wipe: { value: 0 },
    direction: { value: 1 },
    // the view's left edge and width, in the card's uv
    viewSpan: { value: new THREE.Vector2(0, 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: false,
    transparent: true,
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  card.renderOrder = 1;
  card.visible = false;

  let panel: Panel | null = null;
  let progress = 0;
  let target = 0;
  let wipe = -1;
  // the picture covers the whole screen until the panel comes, then fits what the panel leaves (`fit` 0 → 1)
  const view = { x: 0, y: 0, width: 1, height: 1 };
  let fit = 0;
  let fitTarget = 0;

  return {
    card,
    /** The part of the screen (canvas px) the full-screen picture fits: what the project's panel leaves. */
    setView(x: number, y: number, width: number, height: number) {
      Object.assign(view, { x, y, width, height });
    },
    /** Grows from `next` (a panel of the tube); `instant` puts it full screen at once. */
    open(next: Panel, map: THREE.Texture, instant = false) {
      panel = next;
      uniforms.mapA.value = map;
      target = 1;
      if (instant) progress = fit = fitTarget = 1;
    },
    close() {
      target = 0;
      fitTarget = 0;
    },
    /** The panel comes in (true) or goes: the picture makes room for it, or takes the screen back. */
    setFitted(on: boolean) {
      fitTarget = on ? 1 : 0;
    },
    /** Its place in the ring (the project changed while open: it closes into that one's panel). */
    setPanel(next: Panel) {
      if (panel) panel.mesh.visible = true;
      panel = next;
    },
    /** The same picture, sharper (the full-size render once loaded). */
    sharpen(map: THREE.Texture) {
      if (wipe < 0) uniforms.mapA.value = map;
    },
    /** Another picture: wiped in from the right (next) or the left (previous) when full screen. */
    change(map: THREE.Texture, direction: number) {
      if (progress < 1) {
        uniforms.mapA.value = map;
        return;
      }
      if (wipe >= 0) uniforms.mapA.value = uniforms.mapB.value;
      uniforms.mapB.value = map;
      uniforms.direction.value = direction;
      wipe = 0;
    },
    /** 0 = in its panel, 1 = full screen. */
    progress: () => progress,
    isMoving: () => progress !== target || fit !== fitTarget || wipe >= 0,
    update(dt: number, width: number, height: number) {
      const rate = target > progress ? PROJECTS.growS : PROJECTS.shrinkS;
      progress = target > progress ? Math.min(target, progress + dt / rate) : Math.max(target, progress - dt / rate);
      fit = fitTarget > fit ? Math.min(1, fit + dt / PROJECTS.fitS) : Math.max(0, fit - dt / PROJECTS.fitS);
      if (wipe >= 0) {
        wipe = Math.min(1, wipe + dt / PROJECTS.wipeS);
        uniforms.wipe.value = easeSine(wipe);
        if (wipe >= 1) {
          uniforms.mapA.value = uniforms.mapB.value;
          uniforms.wipe.value = 0;
          wipe = -1;
        }
      }
      if (!panel || progress <= 0) {
        if (panel) panel.mesh.visible = true;
        card.visible = false;
        return;
      }
      panel.mesh.visible = false;
      card.visible = true;
      const u = easeInOut(clamp01(progress));

      // from the panel's place (the front, once the tube has brought it there) to facing the camera
      panel.mesh.updateWorldMatrix(true, false);
      panel.mesh.matrixWorld.decompose(from.position, from.quaternion, from.scale);
      if (normal.set(0, 0, 1).applyQuaternion(from.quaternion).z < 0) from.quaternion.multiply(HALF_TURN);
      const settle = clamp01(u * 3);
      card.position.lerpVectors(from.position, FRONT, settle);
      card.quaternion.slerpQuaternions(from.quaternion, FACING, settle);

      // the panel's size at the front of the tube → the whole screen, 1 px of bleed each side
      const toScene = (CAMERA.distance - TUBE.radius) / (pxPerUnit(width) * CAMERA.distance);
      const end = [width + 2, height + 2];
      const size = [lerp(TUBE.panelWidth / toScene, end[0], u), lerp(TUBE.panelHeight / toScene, end[1], u)];
      card.scale.set(size[0] * toScene, size[1] * toScene, 1);
      // the view: the whole screen → what the panel leaves, as the panel comes in
      const f = easeInOut(fit);
      const shown = {
        x: lerp(0, view.x, f),
        y: lerp(0, view.y, f),
        width: lerp(width, view.width, f),
        height: lerp(height, view.height, f),
      };
      uniforms.viewSpan.value.set((shown.x + 1) / end[0], shown.width / end[0]);

      // the picture: the panel's crop → the square render covering the view (mirrored on past its edges, under the panel)
      const side = Math.max(shown.width, shown.height);
      const left = shown.x + (shown.width - side) / 2;
      const top = shown.y + (shown.height - side) / 2;
      uniforms.uvRepeat.value.set(
        lerp(PANEL_CROP.repeat[0], end[0] / side, u),
        lerp(PANEL_CROP.repeat[1], end[1] / side, u),
      );
      uniforms.uvOffset.value.set(
        lerp(PANEL_CROP.offset[0], (-1 - left) / side, u),
        lerp(PANEL_CROP.offset[1], 1 - (end[1] - 1 - top) / side, u),
      );
    },
    dispose() {
      material.dispose();
      card.geometry.dispose();
    },
  };
}
