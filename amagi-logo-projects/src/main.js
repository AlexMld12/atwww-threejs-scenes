import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
// AMAGI LOGO — "Projects" hero.
//
// Just the 3D flame logo, on a TRANSPARENT canvas. Everything else on the page
// (heading, search bar, background) is Webflow's; this scene draws nothing but
// the logo.
//
// Look: the logo material and the three spotlights are lifted 1:1 from
// ../command-center-nobg (itself aligned to the live slider), so the colours
// match the other AMAGI scenes rather than the Figma mock.
//
// Mount: the Webflow div `.projects-logo` (absolute, 100% × 100%). The canvas
// fills it; the logo's resting place and size inside it are fractions of the div
// (logoX / logoY / logoHeight), overridable per Webflow breakpoint.
//
// Behaviour:
//   • intro — rises from below while turning, fading in (once, first time the
//     hero is on screen)
//   • follow — the logo turns its face toward the cursor (desktop)
//   • drag — grab the logo and spin it; it coasts and settles back facing front
//     (mouse on desktop, horizontal swipe on touch)
// ─────────────────────────────────────────────────────────────────────────────

const IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Mobile/i.test(navigator.userAgent);

// Page-level overrides: window.AMAGI_LOGO_CONFIG = { introDelay: 300, ... } set
// BEFORE the module script. Any key of `params` below can be overridden.
const USER_CONFIG = (typeof window !== 'undefined' && window.AMAGI_LOGO_CONFIG) || {};

// ─── Tunable params ──────────────────────────────────────────────────────────
const params = {
  // Light colour (all three spots) — same as the sibling scenes.
  accentColor: '#F95921',

  // ── Logo surface — VERBATIM from command-center-nobg / slider ────────────
  logoMetalness:      0.45,
  logoRoughness:      0.3,
  logoSelfLit:        0.8,
  logoGradientTop:    '#FFC44B',
  logoGradientBottom: '#FA6827',
  logoGradientBias:   1.9,

  // ── Intro ────────────────────────────────────────────────────────────────
  introDelay:     0,      // ms after the hero is first on screen (to sync with Webflow text anims)
  introDuration:  1.8,    // s — rise + turn
  introFade:      0.2,    // fraction of the intro over which opacity goes 0 → 1 (0.2 × 1.8s ≈ 0.36s)
  introRise:      1.1,    // how far below its spot it starts, in LOGO HEIGHTS
  introTurns:     1,      // full turns it makes on the way up

  // ── Follow the cursor (desktop) ──────────────────────────────────────────
  // The face turns toward the cursor: yaw = atan(dx / followDepthPx), etc. A
  // bigger depth = calmer turn for the same mouse travel.
  followDepthPx:  520,
  followMaxYaw:   50,     // degrees
  followMaxPitch: 28,     // degrees
  followRate:     5,      // easing rate (higher = snappier)

  // ── Drag to spin ─────────────────────────────────────────────────────────
  dragDegPerPx:   0.55,   // mouse: degrees of spin per pixel of drag
  dragDegPerPxTouch: 0.7, // touch
  dragHitPadPx:   24,     // mouse grab zone = logo box + this padding
  spinFriction:   2.4,    // how fast a flick slows down (1/s)
  spinSettleRate: 4,      // easing back to "face front" once it has slowed
  spinSettleVel:  2.2,    // rad/s under which the settle takes over

  // ── Camera ───────────────────────────────────────────────────────────────
  fov: 30,                // narrow = little perspective skew away from the centre

  // ── Where the logo rests inside .projects-logo (fractions of the div) ────
  // Defaults = the Figma frame (1424×840): logo centre at (704, 315), 180 px tall.
  // Per Webflow breakpoint overrides go in AMAGI_LOGO_CONFIG.tablet /
  // .mobileLandscape / .mobile (they cascade down like Webflow's — see lp()).
  logoX:        0.494,  // centre, fraction of the div width
  logoY:        0.375,  // centre, fraction of the div height
  logoHeight:   0.214,  // fraction of the div height
  logoMaxWidth: 0.25,   // cap: logo width never exceeds this fraction of the div width

  // ── Lights — positions/intensities VERBATIM from command-center-nobg ─────
  // (expressed there relative to logoBase and a floor at y = -1.4; the floor
  // itself is not drawn here, only the lights that make the logo read)
  ringIntensity: 8,   ringDistance: 7.0, ringDecay: 1.25, ringLiftY: 0.7,
  ringAngleDeg: 70,   ringPenumbra: 0.3, ringTargetOffsetY: 0.8,
  fillIntensity: 3.5, fillDistance: 9,   fillDecay: 1.35, fillHeight: 1.0,
  fillForward: 3.4,   fillAngleDeg: 55,  fillPenumbra: 0.9, fillTargetOffsetY: 1.0,
  floorSpotIntensity: 22, floorSpotDistance: 7, floorSpotDecay: 2.0,
  floorSpotHeight: 3.2,   floorSpotAngleDeg: 40, floorSpotPenumbra: 0.8,
};
Object.assign(params, USER_CONFIG);

// The sibling's world layout, needed only to reproduce its light rig exactly.
const NOBG = { floorRadius: 7, floorTargetY: -1.4, sceneZ: -5, logoExtraScale: 1.12, logoLiftY: 0.06, logoRotationY: 90 };

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// Asset base — set window.AMAGI_LOGO_ASSET_BASE (trailing slash) on Webflow.
const ASSET_BASE = window.AMAGI_LOGO_ASSET_BASE || import.meta.env.BASE_URL;

// ─── Mount ───────────────────────────────────────────────────────────────────
// The Webflow div `.projects-logo` (absolute, 100% × 100% of its section) is
// the canvas area; the logo is placed inside it by logoX / logoY / logoHeight.
// Waits for the div instead of failing: Webflow (or a CMS/interaction) can
// insert it after this module runs. If it never shows up, say so once, quietly.
const MOUNT_SELECTOR = '.projects-logo, [data-amagi-logo]';
const appEl = await new Promise((resolve) => {
  const found = document.querySelector(MOUNT_SELECTOR);
  if (found) return resolve(found);
  const mo = new MutationObserver(() => {
    const el = document.querySelector(MOUNT_SELECTOR);
    if (el) { mo.disconnect(); resolve(el); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  const report = () => setTimeout(() => {
    if (document.querySelector(MOUNT_SELECTOR)) return;
    console.warn(
      `[amagi-logo] waiting for an element matching "${MOUNT_SELECTOR}" — none on this page yet. ` +
      `Found with a similar class: ${[...document.querySelectorAll('[class*="logo"]')].map((e) => '.' + [...e.classList].join('.')).join(', ') || 'nothing'}`);
  }, 1500);
  if (document.readyState === 'complete') report(); else window.addEventListener('load', report);
});
if (getComputedStyle(appEl).position === 'static') appEl.style.position = 'relative';
// The div sits over the text, so it must not block clicks on it — all the
// interaction listens on window.
appEl.style.pointerEvents = 'none';

// `?debug` in the URL outlines the div (green) and the logo's resting box (red)
// — for placing it on the Webflow page.
let debugBox = null;
if (/[?&]debug\b/.test(location.search)) {
  appEl.style.outline = '1px dashed #0f0';
  debugBox = document.createElement('div');
  debugBox.style.cssText = 'position:absolute;outline:1px dashed #f33;pointer-events:none;z-index:1';
  appEl.appendChild(debugBox);
}

// ─── Renderer ────────────────────────────────────────────────────────────────
// Transparent, no post-processing: the logo is drawn straight onto a clear
// canvas so the heading (and any page background) shows around it. Native MSAA
// is enough for one object, and keeps the alpha channel clean.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 2 : 1.75));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const cvs = renderer.domElement;
cvs.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;opacity:0';
appEl.appendChild(cvs);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(params.fov, 1, 0.1, 200);

// ─── Logo material (verbatim port, see command-center-nobg) ─────────────────
const logoGradientUniforms = {
  uTop:     { value: new THREE.Color(params.logoGradientTop) },
  uBottom:  { value: new THREE.Color(params.logoGradientBottom) },
  uMinY:    { value: 0 },
  uMaxY:    { value: 1 },
  uBias:    { value: params.logoGradientBias },
  uSelfLit: { value: params.logoSelfLit },
};
const logoMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff, metalness: params.logoMetalness, roughness: params.logoRoughness, side: THREE.DoubleSide,
});
logoMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, logoGradientUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vLogoY;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLogoY = position.y;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', /* glsl */`#include <common>
      uniform vec3  uTop;
      uniform vec3  uBottom;
      uniform float uMinY;
      uniform float uMaxY;
      uniform float uBias;
      uniform float uSelfLit;
      varying float vLogoY;
      vec3 logoGradient() {
        float t = clamp((vLogoY - uMinY) / max(uMaxY - uMinY, 1e-4), 0.0, 1.0);
        return mix(uBottom, uTop, pow(t, uBias));
      }`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= logoGradient();')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += logoGradient() * uSelfLit;');
};

// logoGroup's origin is the logo's bounding-box CENTRE, so every rotation
// (intro turn, follow, spin) pivots around the middle of the flame.
const logoGroup = new THREE.Group();
scene.add(logoGroup);
const logoCenter = new THREE.Vector3();   // rest position (sibling world space)
const logoSize   = new THREE.Vector3();   // world-space bbox size
let ready = false;

function addSpot(intensity, distance, angleDeg, penumbra, decay, pos, target) {
  const s = new THREE.SpotLight(params.accentColor, intensity, distance, angleDeg * DEG, penumbra, decay);
  s.position.copy(pos);
  s.target.position.copy(target);
  scene.add(s, s.target);
  return s;
}

// ─── GLB load ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

loader.load(`${ASSET_BASE}test_3_.glb`, (gltf) => {
  gltf.scene.updateMatrixWorld(true);
  const logoMeshes = [];
  const floors = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (/^curve/i.test(o.name)) logoMeshes.push(o);
    else if (/^circle/i.test(o.name)) floors.push(o);
  });
  if (!logoMeshes.length) { console.error('[amagi-logo] no logo mesh in GLB'); return; }

  // Reproduce the sibling's world placement of the logo, so its light rig can
  // be reused unchanged. Only the floor's MEASUREMENTS are needed — it is never
  // drawn. Lowest `Circle` = floor dish.
  const lb = new THREE.Box3();
  let floor = null, floorBox = null;
  for (const f of floors) {
    const b = new THREE.Box3().setFromObject(f);
    if (!floorBox || b.getCenter(new THREE.Vector3()).y < floorBox.getCenter(new THREE.Vector3()).y) { floor = f; floorBox = b; }
  }
  const floorR      = floorBox ? Math.max(floorBox.max.x - floorBox.min.x, floorBox.max.z - floorBox.min.z) / 2 : 1;
  const floorCenter = floorBox ? floorBox.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const glbScale    = NOBG.floorRadius / floorR;
  const s           = glbScale * NOBG.logoExtraScale;

  const geoms = logoMeshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld));
  for (const g of geoms) { g.computeBoundingBox(); lb.union(g.boundingBox); }

  // Sibling logoBase (its group position) — same formula as command-center-nobg.
  const yShift      = NOBG.floorTargetY - (floorBox ? floorBox.max.y : 0) * glbScale;
  const logoYAdjust = -lb.min.y * glbScale * (NOBG.logoExtraScale - 1);
  const logoBase = new THREE.Vector3(
    -floorCenter.x * s,
    yShift + logoYAdjust + NOBG.logoLiftY,
    NOBG.sceneZ - floorCenter.z * s,
  );

  // Bake: centre on the bbox, then the sibling's scale + 90° yaw, so the group
  // at identity rotation faces the camera and pivots about its centre.
  const c = lb.getCenter(new THREE.Vector3());
  const bake = new THREE.Matrix4()
    .makeRotationY(NOBG.logoRotationY * DEG)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  const baked = new THREE.Box3();
  for (const g of geoms) {
    g.applyMatrix4(bake);
    g.computeBoundingBox();
    baked.union(g.boundingBox);
    const mesh = new THREE.Mesh(g, logoMaterial);
    mesh.matrixAutoUpdate = false;
    logoGroup.add(mesh);
  }
  baked.getSize(logoSize);
  logoGradientUniforms.uMinY.value = baked.min.y;
  logoGradientUniforms.uMaxY.value = baked.max.y;

  // Where the sibling's group would put the centre.
  logoCenter.copy(c).multiplyScalar(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), NOBG.logoRotationY * DEG).add(logoBase);
  logoGroup.position.copy(logoCenter);

  // The sibling's three spots, at its exact positions.
  const fy = NOBG.floorTargetY;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  spots.push(
    addSpot(params.ringIntensity, params.ringDistance, params.ringAngleDeg, params.ringPenumbra, params.ringDecay,
      V(logoBase.x, fy + params.ringLiftY, logoBase.z), V(logoBase.x, logoBase.y + params.ringTargetOffsetY, logoBase.z)),
    addSpot(params.fillIntensity, params.fillDistance, params.fillAngleDeg, params.fillPenumbra, params.fillDecay,
      V(logoBase.x, fy + params.fillHeight, logoBase.z + params.fillForward), V(logoBase.x, logoBase.y + params.fillTargetOffsetY, logoBase.z)),
    addSpot(params.floorSpotIntensity, params.floorSpotDistance, params.floorSpotAngleDeg, params.floorSpotPenumbra, params.floorSpotDecay,
      V(logoBase.x, fy + params.floorSpotHeight, logoBase.z), V(logoBase.x, fy, logoBase.z)),
  );

  ready = true;
  measure();
  // Fonts / late Webflow layout can still move the heading — re-measure a few times.
  document.fonts?.ready.then(measure);
  [400, 1200, 2500].forEach((t) => setTimeout(measure, t));
  maybeStartIntro();
}, undefined, (err) => console.error('[amagi-logo] GLB load failed:', err));
const spots = [];

// ─── Layout: place the logo inside .projects-logo ──────────────────────────
// All in CSS px relative to the canvas. `box` = where the logo rests on screen.
const box = { cx: 0, cy: 0, h: 0, w: 0 };   // logo rest rect (centre + size), canvas px
let cw = 1, ch = 1;                          // canvas size, CSS px
let worldPerPx = 0.01;                       // at the logo's depth

// Layout param for the current Webflow breakpoint. Cascades like Webflow:
// mobile (≤478) → mobileLandscape (≤767) → tablet (≤991) → base.
const BREAKPOINTS = [['mobile', 478], ['mobileLandscape', 767], ['tablet', 991]];
function lp(key) {
  const w = window.innerWidth;
  for (const [name, max] of BREAKPOINTS) {
    const o = USER_CONFIG[name];
    if (w <= max && o && o[key] !== undefined) return o[key];
  }
  return params[key];
}

function measure() {
  cw = cvs.clientWidth  || 1;
  ch = cvs.clientHeight || 1;
  renderer.setSize(cw, ch, false);
  camera.aspect = cw / ch;

  const aspect = logoSize.y > 0 ? logoSize.x / logoSize.y : 0.5;
  box.h  = Math.max(1, Math.min(ch * lp('logoHeight'), (cw * lp('logoMaxWidth')) / aspect));
  box.w  = box.h * aspect;
  box.cx = cw * lp('logoX');
  box.cy = ch * lp('logoY');
  canvasRect = cvs.getBoundingClientRect();
  if (debugBox) Object.assign(debugBox.style, {
    left: `${box.cx - box.w / 2}px`, top: `${box.cy - box.h / 2}px`, width: `${box.w}px`, height: `${box.h}px`,
  });
  placeCamera();
  dirty = true;
}

// The camera stays parallel to −Z and is SHIFTED (not turned) so the logo's
// centre lands on box.cx/cy; its distance sets the on-screen size.
function placeCamera() {
  if (!ready) return;
  const tanH = Math.tan((params.fov * DEG) / 2);
  const d    = (logoSize.y * ch) / (2 * Math.max(1, box.h) * tanH);
  worldPerPx = (2 * d * tanH) / ch;
  camera.position.set(
    logoCenter.x - (box.cx - cw / 2) * worldPerPx,
    logoCenter.y + (box.cy - ch / 2) * worldPerPx,
    logoCenter.z + d,
  );
  camera.near = Math.max(0.05, d - logoSize.z * 4);
  camera.far  = d + 50;
  camera.updateProjectionMatrix();
}

const ro = new ResizeObserver(measure);
ro.observe(appEl);
window.addEventListener('resize', measure);
window.addEventListener('load', measure);

// ─── Intro ──────────────────────────────────────────────────────────────────
const intro = { state: 'idle', start: 0 };   // idle → wait → run → done
function maybeStartIntro() {
  if (intro.state !== 'idle' || !ready || !onscreen) return;
  intro.state = 'wait';
  setTimeout(() => {
    measure();   // the heading may have animated in since the last measure
    intro.state = 'run';
    intro.start = performance.now() / 1000;
    dirty = true;
  }, params.introDelay);
}
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ─── Interaction state ───────────────────────────────────────────────────────
let mouseX = null, mouseY = null;   // client px; null = no cursor (touch / left the page)
let followYaw = 0, followPitch = 0; // damped, radians
let spin = 0, spinVel = 0;          // drag spin about the logo's own vertical axis
let dragging = false, dragLastX = 0, dragLastT = 0;
let canvasRect = cvs.getBoundingClientRect();
const refreshRect = () => { canvasRect = cvs.getBoundingClientRect(); };
window.addEventListener('scroll', refreshRect, { passive: true });
window.addEventListener('resize', refreshRect);

function overLogo(clientX, clientY) {
  const x = clientX - canvasRect.left, y = clientY - canvasRect.top;
  const p = params.dragHitPadPx;
  return Math.abs(x - box.cx) <= box.w / 2 + p && Math.abs(y - box.cy) <= box.h / 2 + p;
}

// Grab cursor over the logo. The canvas has pointer-events:none (so the heading
// stays clickable), so the cursor has to be set page-wide.
const cursorStyle = document.createElement('style');
cursorStyle.textContent =
  'html.amagi-logo-grab,html.amagi-logo-grab *{cursor:grab!important}' +
  'html.amagi-logo-grabbing,html.amagi-logo-grabbing *{cursor:grabbing!important;user-select:none!important}';
document.head.appendChild(cursorStyle);
const rootCls = document.documentElement.classList;

function spinBy(dxPx, degPerPx, now) {
  const dAng = dxPx * degPerPx * DEG;
  spin += dAng;
  const dt = Math.max(0.008, now - dragLastT);
  spinVel = THREE.MathUtils.lerp(spinVel, dAng / dt, 0.5);   // smoothed flick speed
  dragLastT = now;
  dirty = true;
}

// Mouse (desktop): follow + grab-to-spin. Mouse events, not pointer events, so
// a touch's synthetic mouse events don't double up with the touch handlers.
window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (dragging) {
    spinBy(e.clientX - dragLastX, params.dragDegPerPx, performance.now() / 1000);
    dragLastX = e.clientX;
  } else {
    rootCls.toggle('amagi-logo-grab', ready && overLogo(e.clientX, e.clientY));
  }
  dirty = true;
}, { passive: true });
document.documentElement.addEventListener('mouseleave', () => { mouseX = mouseY = null; dirty = true; });
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !ready || intro.state !== 'done' || !overLogo(e.clientX, e.clientY)) return;
  e.preventDefault();             // no text selection / native drag of the heading
  dragging  = true;
  dragLastX = e.clientX;
  dragLastT = performance.now() / 1000;
  spinVel   = 0;
  rootCls.add('amagi-logo-grabbing');
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  if (performance.now() / 1000 - dragLastT > 0.08) spinVel = 0;   // held still before letting go
  rootCls.remove('amagi-logo-grabbing');
});

// Touch: horizontal swipe that STARTS on the canvas area spins the logo. Touch
// events (not pointer events) because the mount is pointer-events:none — see
// command-center-nobg/CLAUDE.md. A vertical swipe is left to the page's scroll.
let touchId = null, touchStartX = 0, touchStartY = 0, touchAxis = 'idle';
const findTouch = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };
window.addEventListener('touchstart', (e) => {
  if (touchId !== null || !ready || intro.state !== 'done') return;
  const t = e.changedTouches[0];
  if (t.clientX < canvasRect.left || t.clientX > canvasRect.right ||
      t.clientY < canvasRect.top  || t.clientY > canvasRect.bottom) return;
  touchId = t.identifier; touchStartX = t.clientX; touchStartY = t.clientY; touchAxis = 'undecided';
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (touchId === null) return;
  const t = findTouch(e.touches, touchId);
  if (!t) return;
  if (touchAxis === 'undecided') {
    const dx = Math.abs(t.clientX - touchStartX), dy = Math.abs(t.clientY - touchStartY);
    if (Math.max(dx, dy) < 8) return;
    touchAxis = dx > dy ? 'x' : 'y';
    if (touchAxis === 'x') { dragging = true; dragLastX = t.clientX; dragLastT = performance.now() / 1000; spinVel = 0; }
    return;
  }
  if (touchAxis !== 'x') return;
  spinBy(t.clientX - dragLastX, params.dragDegPerPxTouch, performance.now() / 1000);
  dragLastX = t.clientX;
}, { passive: true });
const touchEnd = (e) => {
  if (touchId === null || findTouch(e.touches, touchId)) return;
  if (touchAxis === 'x' && performance.now() / 1000 - dragLastT > 0.08) spinVel = 0;
  touchId = null; touchAxis = 'idle'; dragging = false;
};
window.addEventListener('touchend', touchEnd, { passive: true });
window.addEventListener('touchcancel', touchEnd, { passive: true });

// ─── Frame loop (renders only when something changed) ──────────────────────
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
const clock = new THREE.Clock();
const qFollow = new THREE.Quaternion();
const qSpin   = new THREE.Quaternion();
const eFollow = new THREE.Euler(0, 0, 0, 'YXZ');
const AXIS_Y  = new THREE.Vector3(0, 1, 0);
let dirty = true;
let opacity = 0;

function frame() {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (!ready) return;
  let active = false;

  // Intro: rise + turn + fade.
  let riseY = 0, introSpin = 0;
  if (intro.state === 'run') {
    const p = Math.min(1, (performance.now() / 1000 - intro.start) / params.introDuration);
    const e = easeOutCubic(p);
    riseY     = -(1 - e) * params.introRise * logoSize.y;
    introSpin = -(1 - e) * params.introTurns * TAU;
    opacity   = easeOutCubic(Math.min(1, p / params.introFade));
    if (p >= 1) { intro.state = 'done'; riseY = 0; introSpin = 0; opacity = 1; }
    active = true;
  } else if (intro.state !== 'done') {
    opacity = 0;
  }

  // Follow: the face points at the cursor. Frozen while dragging so the two
  // don't fight; eases back to front when the cursor leaves the page.
  if (!dragging) {
    let ty = 0, tp = 0;
    if (mouseX !== null) {
      const dx = mouseX - (canvasRect.left + box.cx);
      const dy = mouseY - (canvasRect.top + box.cy);
      ty = THREE.MathUtils.clamp(Math.atan2(dx, params.followDepthPx), -params.followMaxYaw * DEG, params.followMaxYaw * DEG);
      tp = THREE.MathUtils.clamp(Math.atan2(dy, params.followDepthPx), -params.followMaxPitch * DEG, params.followMaxPitch * DEG);
    }
    const ny = damp(followYaw, ty, params.followRate, dt);
    const np = damp(followPitch, tp, params.followRate, dt);
    if (Math.abs(ny - followYaw) + Math.abs(np - followPitch) > 1e-5) active = true;
    followYaw = ny; followPitch = np;
  }

  // Spin: coast after a flick, then settle on the nearest "facing front".
  if (!dragging) {
    spin    += spinVel * dt;
    spinVel *= Math.exp(-params.spinFriction * dt);
    if (Math.abs(spinVel) < params.spinSettleVel) {
      const rest = Math.round(spin / TAU) * TAU;
      spin    = damp(spin, rest, params.spinSettleRate, dt);
      spinVel = damp(spinVel, 0, params.spinSettleRate, dt);
      if (Math.abs(spin - rest) < 1e-4 && Math.abs(spinVel) < 1e-3) { spin = 0; spinVel = 0; }
    }
    if (spin !== 0 || spinVel !== 0) active = true;
  } else {
    active = true;
  }

  if (!active && !dirty) return;
  dirty = false;

  logoGroup.position.set(logoCenter.x, logoCenter.y + riseY, logoCenter.z);
  // follow (world yaw, then pitch) ∘ spin about the logo's own vertical axis
  eFollow.set(followPitch, followYaw, 0, 'YXZ');
  qFollow.setFromEuler(eFollow);
  qSpin.setFromAxisAngle(AXIS_Y, spin + introSpin);
  logoGroup.quaternion.copy(qFollow).multiply(qSpin);
  // The fade is the canvas' CSS opacity: one compositor op, and no transparent
  // material sorting artefacts on a double-sided mesh.
  cvs.style.opacity = opacity.toFixed(3);
  renderer.render(scene, camera);
}

// ─── Run only while on screen and the tab is visible ────────────────────────
let rafId = null, onscreen = false, pageVisible = !document.hidden;
function syncLoop() {
  const run = onscreen && pageVisible;
  if (run && rafId === null) { clock.getDelta(); dirty = true; rafId = requestAnimationFrame(frame); }
  else if (!run && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}
new IntersectionObserver((entries) => {
  onscreen = entries[entries.length - 1].isIntersecting;
  if (onscreen) refreshRect();
  syncLoop();
  maybeStartIntro();
}).observe(appEl);
document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; syncLoop(); });
