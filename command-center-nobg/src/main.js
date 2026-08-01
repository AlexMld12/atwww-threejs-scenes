import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND CENTER — "no background" variant.
//
// Stripped fork of ../command-center-slider. What that scene has and this one
// deliberately does NOT:
//   • the ring of 3 video screens (+ their VideoTextures, hover masks, per-screen
//     RectAreaLights and the frame-color sampling that drove them)
//   • the ceiling shell (the upper `Circle` piece of the GLB)
//   • both planar Reflectors (floor mirror + ceiling mirror)
//   • the floor occluder and the "well" walls
//   • ALL scroll interaction — ring rotation, the logo exit/descent/spin, the
//     emissive gradient crossfade, the DOM blackout overlay, the canvas
//     transparency fade
// What is left: a black background, the floor dish, the logo, the lights that
// make the logo readable, the intro animation and the logo interaction (cursor
// tilt on desktop, drag-and-hold on touch) — all three ported 1:1 from the
// sibling, per review 2026-08-01.
//
// The sibling scene is deployed and live — nothing here writes to it.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Performance tier (mobile vs desktop) ───────────────────────────────────
// This scene is a fraction of the sibling's cost (no video texture uploads, no
// planar reflectors = no extra full-scene renders), but the tier split is kept:
// phones still choke on high MSAA and full-res post-process buffers.
const IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Mobile/i.test(navigator.userAgent);
const PIXEL_RATIO_CAP = IS_MOBILE ? 1 : 1.5;
// MSAA multiplies framebuffer BANDWIDTH by the sample count regardless of bit
// depth — nearly free on Apple's tile-based GPUs, real main-memory traffic on
// the Adreno/Mali parts in Android phones. 2× everywhere.
const MSAA_SAMPLES = 2;

// ─── Mount target + viewport sizing ─────────────────────────────────────────
// Mount into the Webflow container (#ccn-canvas, absolute-filling its section)
// when embedded, or the local #app scaffold for `npm run dev`. All sizing is
// driven off this element's client size rather than window.innerHeight (which
// shrinks/grows as the mobile URL bar shows/hides) so the canvas stays locked to
// its container and scrolling never exposes a gap.
// NOTE the id is #ccn-canvas, NOT the sibling scene's #cc-canvas — so both can
// live on the same Webflow page without fighting over the same mount point.
const appEl = document.getElementById('ccn-canvas') || document.getElementById('app');
const viewportW = () => appEl.clientWidth  || window.innerWidth;
const viewportH = () => appEl.clientHeight || window.innerHeight;

// ─── Renderer ────────────────────────────────────────────────────────────────
// antialias:false — all scene geometry renders through the EffectComposer into
// an MSAA render target (composerRT) and only a fullscreen quad (OutputPass)
// hits the default framebuffer, so the renderer's own MSAA would anti-alias
// nothing but that quad's screen-border edge. Dropping it is free.
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
// ─── Adaptive resolution state ──────────────────────────────────────────────
// BASE_PR is the full-quality (capped) device pixel ratio. renderScale multiplies
// it: 1.0 = full DPR. The controller in animate() steps it DOWN only when the
// TRUE GPU frame time stays over budget, and reclaims a step when the measured
// cost shows sustained headroom. On a GPU that holds the budget it stays pinned
// at 1.0 forever, so output is identical to the non-adaptive path.
const BASE_PR = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP);
let renderScale = 1;
const RS_STEPS  = [1.0, 0.85, 0.72, 0.6];
let rsIndex     = 0;
renderer.setPixelRatio(BASE_PR);
renderer.setClearColor(0x000000, 1);  // black; applyColors() resets it from params.bg
// updateStyle=false: we only drive the drawing-buffer size and set the canvas
// CSS to fill its container ourselves (below), so it works whether or not the
// host page has a `#app canvas { width:100% }` rule.
renderer.setSize(viewportW(), viewportH(), false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.display = 'block';
renderer.domElement.style.width   = '100%';
renderer.domElement.style.height  = '100%';
// REQUIRED for the touch-drag logo spin to work at all (learned the hard way in
// the sibling scene, review round 8). With the default `touch-action: auto` the
// browser claims a touch gesture for panning as soon as the finger moves and
// STOPS delivering pointermove (it fires pointercancel instead), so the drag
// handler never sees anything on a real phone. `pan-y` hands VERTICAL panning —
// the host page's scroll — to the browser while leaving HORIZONTAL movement to
// us. The drag itself no longer DEPENDS on this (it runs on touch events, which
// survive a browser pan — see the drag section), but keeping it declared means the
// browser doesn't start a horizontal pan/overscroll under the gesture on hosts
// where these elements ARE the hit target.
renderer.domElement.style.touchAction = 'pan-y';
appEl.style.touchAction = 'pan-y';
appEl.appendChild(renderer.domElement);

// ─── Loader overlay (plain black, hides the canvas until the GLB is ready) ──
// Scoped to the MOUNT ELEMENT, not document.body: in Webflow this scene is one
// section of a longer page, so a fixed full-page black overlay would blank the
// user's own content while the model loads. Needs a positioned ancestor —
// #app is fixed locally, the Webflow container is absolute; if a host page ever
// leaves it static, promote it here so `inset:0` still resolves to the canvas.
if (getComputedStyle(appEl).position === 'static') appEl.style.position = 'relative';
const loaderEl = document.createElement('div');
loaderEl.style.cssText = 'position:absolute;inset:0;background:#000;z-index:10;transition:opacity 0.6s ease-out;pointer-events:none';
appEl.appendChild(loaderEl);

// ─── Perf HUD (opt-in: add ?perf to the URL, or set window.CCN_PERF) ────────
// There are no DevTools on a phone, so this is how the mobile tier gets VERIFIED
// instead of guessed at. Off unless explicitly asked for. `gpu` reads n/a on
// Safari/iOS: EXT_disjoint_timer_query_webgl2 isn't exposed there, which is also
// why the adaptive-resolution controller is disabled on iOS (renderScale 1.0).
const PERF_HUD = /[?&]perf\b/.test(location.search) || !!window.CCN_PERF;
let hudEl = null;
if (PERF_HUD) {
  hudEl = document.createElement('div');
  hudEl.style.cssText =
    'position:fixed;top:0;left:0;z-index:100000;pointer-events:none;' +
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'background:rgba(0,0,0,.72);color:#0f0;padding:6px 8px;white-space:pre;' +
    'border-bottom-right-radius:6px;text-shadow:0 0 2px #000';
  document.body.appendChild(hudEl);
}
let hudFrames = 0, hudLast = 0, hudFps = 0;
function updateHud() {
  if (!hudEl) return;
  hudFrames++;
  const now = performance.now();
  if (hudLast === 0) { hudLast = now; return; }
  if (now - hudLast < 500) return;              // refresh twice a second, no more
  hudFps    = (hudFrames * 1000) / (now - hudLast);
  hudFrames = 0;
  hudLast   = now;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  hudEl.textContent =
    `fps      ${hudFps.toFixed(1)}\n` +
    `gpu      ${rsExt ? rsGpuMs.toFixed(2) + ' ms (budget ' + RS_BUDGET_MS + ')' : 'n/a — no timer ext'}\n` +
    `rScale   ${renderScale.toFixed(2)}  (dpr ${renderer.getPixelRatio().toFixed(2)})\n` +
    `buffer   ${size.x}x${size.y}\n` +
    `tier     ${IS_MOBILE ? 'MOBILE' : 'desktop'}  msaa ${MSAA_SAMPLES}  outline ${outlinePass.enabled ? 'on/' + outlinePass.downSampleRatio : 'OFF'}\n` +
    `smaa     ${IS_MOBILE ? 'off' : 'on'}`;
}

// Single-phase intro: rises the logo and ramps the spotlights 0→full. There is
// NO opacity fade (review 2026-08-01: "aceeasi animatie de intro, dar fara
// opacitate") — the logo is opaque from frame one, exactly like the sibling,
// which dropped its own fade in its review round 2. Once the intro has run the
// scene is static apart from the logo tilt / drag.
const logoAnim = { phase: 'idle', phaseStart: 0, currentY: 0 };

let revealed = false;
function revealScene() {
  if (revealed) return;
  revealed = true;
  loaderEl.style.opacity = '0';
  setTimeout(() => loaderEl.remove(), 700);
  maybeStartIntro();
}

// The intro plays the first time the scene is BOTH loaded and actually on
// screen — not simply when the GLB arrives. In Webflow this section can sit
// well below the fold: the render loop is paused while off-screen (see
// syncLoop), but logoAnim.phaseStart is wall-clock, so starting the timeline at
// load time would burn the whole 3s rise before the user ever scrolled down and
// they would arrive to a logo that is already just… there. Gating on visibility
// means the rise + spot ramp always runs in front of them.
// It also means the parked-below-the-floor logo is never RENDERED: the observer
// callback starts the loop and the intro together, and the load callback parks
// the logo and calls startLogoAnimation in the same tick — which matters now that
// the logo is opaque while it waits down there.
function maybeStartIntro() {
  if (logoAnim.phase !== 'idle') return;   // already played
  if (!layout.ready || !onscreen) return;
  startLogoAnimation();
}

// Safety net: if the GLB stalls forever, drop the black overlay anyway after
// 20s rather than leaving a dead black box in the page.
setTimeout(() => {
  if (!revealed) {
    console.warn('Loader timeout — revealing scene');
    revealScene();
  }
}, 20000);

function startLogoAnimation() {
  if (!layout.ready) return;
  logoAnim.phase      = 'run';
  logoAnim.phaseStart = performance.now() / 1000;
  logoAnim.currentY   = logoBase.y - params.logoAnimRise;
  logoGroup.position.y     = logoAnim.currentY;
  outlinePass.edgeStrength = 0;
  if (logoSpot)  logoSpot.intensity  = 0;
  if (floorSpot) floorSpot.intensity = 0;
  if (fillSpot)  fillSpot.intensity  = 0;
}

// ─── Scene + camera ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// No scene.background — the renderer's clear color paints the black backdrop.
scene.background = null;
// This Scene is a pure identity root: nothing ever transforms `scene` itself.
// With matrixAutoUpdate ON the root sets matrixWorldNeedsUpdate every frame,
// force-recomputing the world matrix of the ENTIRE tree. Turning it OFF stops
// that. matrixWorldAutoUpdate stays ON, so the renderer still walks the graph
// and the ANIMATED node (logoGroup, which keeps matrixAutoUpdate ON) still
// updates itself and its subtree. The static floor then truly stops
// recomputing matrices per frame. Zero visual change.
scene.matrixAutoUpdate = false;

const camera = new THREE.PerspectiveCamera(55, viewportW() / viewportH(), 0.1, 100);

// Effective camera distance — updated by updateFraming() from the viewport
// aspect (pulled back on portrait so the floor dish still fits).
let camDistanceEff = 4;

// ─── Postprocessing (EffectComposer) ────────────────────────────────────────
// EffectComposer renders into an offscreen RT, which bypasses the renderer's own
// MSAA. Give the composer its own RT with MSAA so geometry edges (the floor rim,
// the logo silhouette) and the OutlinePass' thin neon edges don't ladder.
// Desktop uses HalfFloatType (headroom for any future HDR pass); mobile uses
// UnsignedByteType (8-bit) — far lower bandwidth, a big win on weaker Android
// GPUs that are slow with float render targets. No HDR pass is in the chain, so
// 8-bit clips nothing visible.
const composerRT = new THREE.WebGLRenderTarget(
  viewportW(),
  viewportH(),
  {
    type:    IS_MOBILE ? THREE.UnsignedByteType : THREE.HalfFloatType,
    samples: MSAA_SAMPLES,
  },
);
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));

const outlinePass = new OutlinePass(
  new THREE.Vector2(viewportW(), viewportH()),
  scene,
  camera,
);
// Placeholders — the real values come from `params` via applyColors(), which
// runs once params exists (it is declared below this block). edgeStrength is
// then driven per-frame by the intro ramp in animate().
outlinePass.edgeStrength  = 0;
outlinePass.edgeGlow      = 0.8;
outlinePass.edgeThickness = 1.0;
// Desktop keeps full-res edge buffers (1) — that's what kills the neon-outline
// stairs on the logo. Mobile uses 2 (half-res per axis = a QUARTER of the
// pixels): three's OutlinePass hardcodes HalfFloatType on 5 of its 7 internal
// buffers, so at downSampleRatio 1 it hands the GPU full-resolution FLOAT16
// render targets — exactly what composerRT's UnsignedByteType avoids on weak
// Android GPUs. 2 is also three's own constructor default, so no reallocation.
outlinePass.downSampleRatio = IS_MOBILE ? 2 : 1;
// Start DISABLED — animate() turns it on the frame edgeStrength goes above 0.
// With params.outlineStrength at 0 (review 2026-08-01) that never happens, so the
// pass' two full-scene re-renders + HalfFloat blur chain never run at all. It
// stays wired in so raising outlineStrength brings the outline straight back.
outlinePass.enabled = false;
composer.addPass(outlinePass);
// SMAA. Its original job was the outline's post-process edges (which MSAA can't
// touch, since they're drawn after the resolved render pass); with the outline
// off it now smooths the logo's own silhouette, which MSAA_SAMPLES 2 leaves a
// little steppy on a high-contrast orange-on-black edge. DESKTOP ONLY: it's three
// more full-resolution fullscreen passes, and on mobile the higher device pixel
// ratio already hides the stepping.
if (!IS_MOBILE) {
  const pr = renderer.getPixelRatio();
  composer.addPass(new SMAAPass(viewportW() * pr, viewportH() * pr));
}
composer.addPass(new OutputPass());

// ─── Adaptive resolution controller ─────────────────────────────────────────
// applyRenderScale() re-applies the current renderScale to the whole chain. The
// controller lives in animate(). It judges load on the TRUE GPU frame time —
// read with an EXT_disjoint_timer_query_webgl2 timer query wrapped around the
// frame's render — NOT on the requestAnimationFrame interval. The rAF interval
// is bounded below by vsync (~16.7ms @60Hz), so it can't tell a fast GPU (2ms)
// from one just coping (16ms), and a stray frame there wrongly downscales even a
// very capable GPU. The measured GPU cost is vsync-INDEPENDENT. If the extension
// is unavailable (rsExt === null, e.g. Safari) the controller is fully DISABLED
// and renderScale stays 1.0 forever (full quality).
const gl    = renderer.getContext();
const rsExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

const RS_BUDGET_MS    = 13;  // sustained EMA above this (ms of GPU time) ⇒ over budget → downscale
const RS_HEADROOM_MS  = 8;   // sustained EMA below this ⇒ clear headroom → upscale (deadband 8–13ms)
const RS_DOWN_SAMPLES = 20;  // consecutive over-budget measured samples before a downscale
const RS_UP_SAMPLES   = 60;  // consecutive headroom measured samples before an upscale
const RS_COOLDOWN     = 45;  // min measured samples between scale changes
const RS_WARMUP       = 15;  // ignore the first measured samples (shader compile / warm-up)
const RS_SETTLE       = 2;   // skip a couple of samples after a scale change / resume / resize

let rsGpuMs      = 0;      // EMA of the true GPU frame time in ms
let rsSeeded     = false;  // EMA seeds on the first valid measured sample
let rsQuery      = null;   // the single TIME_ELAPSED_EXT query in flight (null = none)
let rsWarmup     = RS_WARMUP;
let rsSettle     = 0;
let rsOverCount  = 0;
let rsUnderCount = 0;
let rsCooldown   = 0;

function applyRenderScale() {
  const pr = BASE_PR * renderScale;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);   // cascades pr → composerRT + OutputPass (+ SMAAPass on desktop)
  const w = viewportW(), h = viewportH();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  outlinePass.setSize(w, h);    // handles its own edge/blur RTs
  // The RT reallocation above perturbs the next couple of measured GPU timings —
  // skip them and clear the sustain counters so the controller never reads its
  // own resize hitch as over-budget frames.
  rsSettle     = Math.max(rsSettle, RS_SETTLE);
  rsOverCount  = 0;
  rsUnderCount = 0;
}

// ─── Tunable params ──────────────────────────────────────────────────────────
// No GUI — edit, save, refresh.
const params = {
  // Background — pure black. The sibling scene fades its clear alpha to 0 in the
  // well so a page-wide background canvas shows through; here the brief is a
  // plain black backdrop, so the clear stays opaque.
  bg:          '#000000',
  // The colour of the LIGHTS — all three spotlights (and the outline, if it is
  // ever switched back on). Distinct from the logo's own gradient colours below:
  // this is what the floor pool and the sheens on the logo are tinted with.
  accentColor: '#F95921',

  // Floor (the single lowest `Circle` piece of the GLB — the ceiling piece is
  // never added to the scene).
  // The sibling scene's floor mesh is '#a00d00' (saturated red), but there the
  // planar mirror covers everything outside r=2, so that red is only ever seen
  // in the small inner disc. With the mirror gone the raw mesh IS the floor, and
  // '#a00d00' washes the whole dish blood-red. A near-black base reads as the
  // dark concrete of the reference: the spot's orange only shows where it lands.
  floorColor:     '#0f0f0f',
  floorMetalness: 0.6,
  floorRoughness: 0.25,

  // ── Logo surface (review 2026-08-01) ─────────────────────────────────────
  // Was a transmissive "glass/ice" MeshPhysicalMaterial in dark red. The review
  // asked for the SAME colours as the sibling scene, so this is now that
  // scene's material verbatim: the brand linear gradient on a MATTE metal, fed
  // to both the diffuse and an emissive floor (logoSelfLit) by a small shader
  // patch on MeshStandardMaterial. See the logoMaterial block below for why a
  // patch rather than a texture, and why Standard rather than Physical.
  //
  // The self-lit floor is what makes the brand colours survive here: this scene
  // has no ambient light and no video screens, so with logoSelfLit at 0 the
  // logo would only be the three spotlights' orange wash. At 0.8 the authored
  // gold→orange ramp reads on its own and the spots add the light play on top.
  logoMetalness:      0.45,
  logoRoughness:      0.3,        // "mat": lights spread into broad sheens, not sharp glints
  logoSelfLit:        0.8,        // how much of the pure brand gradient shows with no light on it
  logoGradientTop:    '#FFC44B',  // brand warm gold — top of the logo
  logoGradientBottom: '#FA6827',  // brand burnt orange — bottom
  // Shifts the gradient DOWN the logo without touching either brand hex: the
  // vertical ramp t is raised to this power, so >1 lets the orange climb higher
  // and leaves the gold as a tip highlight. 1 = pure linear ramp.
  logoGradientBias:   1.9,

  // Logo orientation + intro animation
  logoRotationY:    90,   // degrees around Y so the logo faces the camera
  logoAnimRise:     2,    // start this far BELOW logoBase, then rise to it
  logoAnimDuration: 3,    // the rise (no opacity fade — see startLogoAnimation)
  spotAnimDuration: 6,    // spotlights ramp independently over this duration

  // ── Logo interaction (ported from the sibling, review 2026-08-01) ─────────
  // Mouse TILT — always active (does not wait for the intro). The logo leans
  // AWAY from the cursor: the edge nearest the mouse rotates back, so it reads
  // as an object you could grab and turn. Replaces the positional parallax this
  // scene used to have, which merely slid the logo sideways and read as a camera
  // wobble rather than as the logo itself rotating.
  // Split per axis: the yaw (side to side) carries the effect, the pitch is kept
  // small on purpose so the logo doesn't rock toward the camera.
  logoTiltYawDeg:   20,   // LEFT/RIGHT lean (rotation about world Y, from mouse X)
  logoTiltPitchDeg: 2.5,  // FRONT/BACK lean (rotation about world X, from mouse Y)
  logoTiltRate:     6,    // easing rate toward the cursor target (higher = snappier)
  // Touch drag → yaw the logo (mobile only; see dragBegin/dragMove). A full
  // screen-width horizontal swipe turns it logoDragYawDeg, capped at
  // logoDragMaxDeg so it can never whip around. logoDragRate is the easing WHILE
  // dragging and back to rest on release — deliberately lower than logoTiltRate
  // for a smooth, heavy feel.
  logoDragYawDeg: 150,
  logoDragMaxDeg: 75,
  logoDragRate:   3.5,

  // Neon outline (OutlinePass) — REMOVED per review 2026-08-01 ("putem sa
  // scoatem si outline-ul de pe logo"), matching the sibling, which dropped it
  // in its own round 2. Strength 0 is the real off switch, not a dead knob:
  // animate() only enables the pass once edgeStrength rises above 0, so at 0 the
  // pass never runs and the scene drops 2 full-scene re-renders + ~7 float16
  // fullscreen passes per frame — by far the heaviest item in the chain. The
  // pass stays wired into the composer (and the colour/glow/thickness knobs
  // stay) so raising this restores it.
  outlineEnabled:   false,
  outlineColor:     '#f95921',
  outlineStrength:  0,
  outlineGlow:      0.8,
  outlineThickness: 1.0,

  // Camera — completely fixed. Repositioned only on resize (updateFraming).
  fov:            70,
  cameraDistance: 4,
  cameraHeight:   0.0,
  lookOffsetX:    0,
  lookOffsetY:    2,
  lookOffsetZ:    0,
  // Responsive framing: on viewports NARROWER than framingRefAspect (portrait /
  // tablet) the camera pulls back so the floor dish still fits; on landscape /
  // desktop (aspect ≥ ref) the base distance is kept. portraitFit scales how
  // aggressively it pulls back: 1.0 = fully fit, 0.0 = never pull back.
  framingRefAspect: 1.6,
  portraitFit:      0.35,

  // Scene layout
  sceneZ:         -5,
  floorTargetY:   -1.4,
  floorRadius:    7,
  // Scales the logo about its base (logoYAdjust keeps it standing on the floor).
  // Matches the sibling scene exactly per review 2026-08-01 ("marimea trebuie sa
  // fie la fel"): 1.12 on desktop, 1.32 on portrait (see the IS_MOBILE block).
  logoExtraScale: 1.12,
  // Extra world-space lift of the logo's RESTING height, on top of the layout's
  // own "stand it on the floor" placement. Review 2026-08-01: the logo's base was
  // clipped by the floor dish on mobile. The sibling hit the same thing (its round
  // 6) and fixed it the same way — desktop frames it fine, so the lift is small
  // there and the IS_MOBILE block raises it.
  logoLiftY:      0.06,

  // ── Lights ────────────────────────────────────────────────────────────────
  // "Legendary drop" SpotLight: one cone shining UP from the floor center at the
  // logo. Reach is much longer than the sibling's (2.7 @ decay 2.15) because
  // there the logo also caught fill from the three screens' RectAreaLights.
  //
  // INTENSITY DROPPED 26 → 8 with the gradient material (review 2026-08-01).
  // Both logo-facing spots were tuned against the old dark-red glass, which had
  // almost no colour of its own — they had to CREATE the logo's brightness. The
  // gradient material carries its own colour (logoSelfLit 0.8), so the same 26
  // stacked on top of it and clipped the flame's lower body to near-white. These
  // two now only add light play; changing them does NOT darken the floor (this
  // cone points up and away from it — floorSpot owns the floor).
  ringEnabled:       true,
  ringIntensity:     8,
  ringDistance:      7.0,
  ringDecay:         1.25,
  ringLiftY:         0.7,
  ringAngleDeg:      70,    // cone half-angle
  ringPenumbra:      0.3,
  ringTargetOffsetY: 0.8,   // height above logoBase where the spot aims

  // Front fill. The up-spot sits directly under the logo, so it only grazes the
  // flame's camera-facing faces — they stayed nearly black while the curved
  // edges glowed. This cone comes from low and in FRONT (camera side) to light
  // those faces.
  //
  // CUT HARDEST (26 → 3.5): it sits almost exactly ON the camera axis, so at the
  // gradient material's roughness (0.3, sibling parity — the old glass ran 0.42
  // for exactly this reason) its specular lobe lands as a mirror-bright blob dead
  // centre on the flame's flat front face. The sibling never has this problem
  // because its only lights are the screens, off to the sides. Low enough that
  // the front face reads as the brand gradient with a soft sheen, not a hotspot.
  fillEnabled:      true,
  fillIntensity:    3.5,
  fillDistance:     9,
  fillDecay:        1.35,
  fillHeight:       1.0,    // above the floor surface
  fillForward:      3.4,    // toward the camera from the logo
  fillAngleDeg:     55,
  fillPenumbra:     0.9,
  fillTargetOffsetY: 1.0,   // above logoBase where the fill aims

  // Floor pool light. In the sibling scene the floor was lit by the three video
  // screens' RectAreaLights; with the screens gone the upward ring spot lights
  // ONLY the logo (its cone points away from the floor), so the dish would
  // render pure black. This downward cone from just above the logo puts the
  // glowing pool back under it.
  floorSpotEnabled:   true,
  floorSpotIntensity: 22,
  floorSpotDistance:  7,
  floorSpotDecay:     2.0,
  floorSpotHeight:    3.2,   // height above the floor surface
  floorSpotAngleDeg:  40,    // cone half-angle
  floorSpotPenumbra:  0.8,
};

// ─── Mobile-only overrides ──────────────────────────────────────────────────
// Same values the sibling scene uses, for the same reasons. DESKTOP keeps every
// value above untouched.
if (IS_MOBILE) {
  // Bigger logo on portrait: the camera pulls back there (portraitFit), so the
  // desktop scale renders small on a phone.
  params.logoExtraScale   = 1.32;
  // …and a taller logo re-approaches the floor, so the lift goes up with it.
  // This is the review's "pe mobil e taiat de podea".
  params.logoLiftY        = 0.22;
  // Touch drag fully REPLACES the cursor tilt here — zero both cursor amounts so
  // the gesture is the only thing that turns the logo. This is not just tidiness:
  // a single tap still fires one pointermove, which would set ndcMouse and leave
  // the logo stuck at a static tilt with nothing to bring it back (there is no
  // hover on touch).
  params.logoTiltYawDeg   = 0;
  params.logoTiltPitchDeg = 0;
  // "smooth, deloc agresiv" — soften further than the default and shorten the throw.
  params.logoDragYawDeg   = 110;
  params.logoDragRate     = 2.6;
}

// Asset base URL. Locally (npm run dev / the standalone page) this is
// import.meta.env.BASE_URL so the GLB resolves relative to the deployed page.
// When embedded in Webflow the relative path is wrong, so the host page sets
// `window.CCN_ASSET_BASE` (e.g. a jsDelivr URL) BEFORE loading this script.
// Must end with a trailing slash. Distinct from the sibling's CC_ASSET_BASE.
const ASSET_BASE = (typeof window !== 'undefined' && window.CCN_ASSET_BASE) || import.meta.env.BASE_URL;

// Measurements pulled from the GLB after it loads.
const layout = {
  ready:               false,
  measuredFloorRadius: 0,
  floorCenter:         new THREE.Vector3(),
  logoBboxMinY:        0,
  floorBboxMaxY:       0,
  floorMesh:           null,   // the lowest `Circle` piece — the actual floor
  logoMeshes:          [],     // `Curve`
};

// ─── Logo material (matte gradient metal, lit by the scene) ─────────────────
// Ported verbatim from the sibling scene (review 2026-08-01 asked for the same
// colours). Was a transmissive MeshPhysicalMaterial in dark red here.
//
// Why MeshStandardMaterial + a shader patch rather than glass or a texture:
//  • Standard, not Physical: nothing needs transmission/clearcoat/sheen, and
//    dropping transmission also drops three's separate transmission render pass
//    + framebuffer copy — one of the mobile costs flagged in CLAUDE.md.
//  • A patch, not a gradient texture: the GLB's logo UVs are not vertically
//    aligned, so a texture would smear. Driving the gradient off LOCAL position.y
//    is exact and free.
// The gradient feeds BOTH the diffuse/specular colour and an emissive floor
// (uSelfLit), because this scene has no ambient light at all — without it the
// logo would be black wherever no spot lands.
const logoGradientUniforms = {
  uTop:     { value: new THREE.Color(params.logoGradientTop) },
  uBottom:  { value: new THREE.Color(params.logoGradientBottom) },
  uMinY:    { value: 0 },   // filled in from the logo bbox once the GLB loads
  uMaxY:    { value: 1 },
  uBias:    { value: params.logoGradientBias },
  uSelfLit: { value: params.logoSelfLit },
};

const logoMaterial = new THREE.MeshStandardMaterial({
  color:     0xffffff,   // the gradient multiplies into this
  metalness: params.logoMetalness,
  roughness: params.logoRoughness,
  side:      THREE.DoubleSide,
  // Opaque, unlike the sibling: that scene keeps `transparent` on because its
  // scroll exit fades the logo out under a gradient shell. There is no exit here
  // and the intro no longer fades opacity, so nothing ever writes opacity — an
  // opaque material renders identically and skips the blend + the transparent
  // render list.
});

logoMaterial.onBeforeCompile = (shader) => {
  // Shared uniform objects (by reference) so uMinY/uMaxY can still be written
  // after the GLB loads and after the shader has compiled.
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
    // Tint the base colour — with metalness this also tints the light reflections,
    // which is what keeps the sheens gold/orange instead of white.
    .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= logoGradient();')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += logoGradient() * uSelfLit;');
};

// ─── Groups ──────────────────────────────────────────────────────────────────
const logoGroup  = new THREE.Group();
const floorGroup = new THREE.Group();
const ringGroup  = new THREE.Group();
const logoBase   = new THREE.Vector3();
const floorBase  = new THREE.Vector3();
scene.add(logoGroup, floorGroup, ringGroup);

let logoSpot        = null;  // up-cone at the logo
let logoSpotTarget  = null;
let floorSpot       = null;  // down-cone at the floor
let floorSpotTarget = null;
let fillSpot        = null;  // low front cone at the logo
let fillSpotTarget  = null;
const DEG_TO_RAD = Math.PI / 180;

function rebuildLights() {
  for (const o of [logoSpot, floorSpot, fillSpot]) if (o?.parent) o.parent.remove(o);
  for (const o of [logoSpotTarget, floorSpotTarget, fillSpotTarget]) if (o?.parent) o.parent.remove(o);
  logoSpot = floorSpot = fillSpot = null;
  logoSpotTarget = floorSpotTarget = fillSpotTarget = null;

  if (params.ringEnabled) {
    logoSpotTarget = new THREE.Object3D();
    scene.add(logoSpotTarget);
    logoSpot = new THREE.SpotLight(
      params.accentColor,
      params.ringIntensity,
      params.ringDistance,
      params.ringAngleDeg * DEG_TO_RAD,
      params.ringPenumbra,
      params.ringDecay,
    );
    logoSpot.position.set(0, 0, 0);     // local to ringGroup (floor center, lifted)
    logoSpot.target = logoSpotTarget;
    ringGroup.add(logoSpot);
  }

  if (params.floorSpotEnabled) {
    floorSpotTarget = new THREE.Object3D();
    scene.add(floorSpotTarget);
    floorSpot = new THREE.SpotLight(
      params.accentColor,
      params.floorSpotIntensity,
      params.floorSpotDistance,
      params.floorSpotAngleDeg * DEG_TO_RAD,
      params.floorSpotPenumbra,
      params.floorSpotDecay,
    );
    floorSpot.target = floorSpotTarget;
    scene.add(floorSpot);
  }

  if (params.fillEnabled) {
    fillSpotTarget = new THREE.Object3D();
    scene.add(fillSpotTarget);
    fillSpot = new THREE.SpotLight(
      params.accentColor,
      params.fillIntensity,
      params.fillDistance,
      params.fillAngleDeg * DEG_TO_RAD,
      params.fillPenumbra,
      params.fillDecay,
    );
    fillSpot.target = fillSpotTarget;
    scene.add(fillSpot);
  }
}

function updateLightPositions() {
  ringGroup.position.set(
    logoBase.x,
    params.floorTargetY + params.ringLiftY,
    logoBase.z,
  );
  if (logoSpotTarget) {
    logoSpotTarget.position.set(
      logoBase.x,
      logoBase.y + params.ringTargetOffsetY,
      logoBase.z,
    );
  }
  if (floorSpot) {
    floorSpot.position.set(
      logoBase.x,
      params.floorTargetY + params.floorSpotHeight,
      logoBase.z,
    );
    floorSpotTarget.position.set(logoBase.x, params.floorTargetY, logoBase.z);
  }
  if (fillSpot) {
    fillSpot.position.set(
      logoBase.x,
      params.floorTargetY + params.fillHeight,
      logoBase.z + params.fillForward,
    );
    fillSpotTarget.position.set(
      logoBase.x,
      logoBase.y + params.fillTargetOffsetY,
      logoBase.z,
    );
  }
}

function applyLightColors() {
  if (logoSpot)  logoSpot.color.set(params.accentColor);
  if (floorSpot) floorSpot.color.set(params.accentColor);
  if (fillSpot)  fillSpot.color.set(params.accentColor);
}

function bakeIntoGroup(meshes, group, material) {
  const bbox = new THREE.Box3();
  for (const mesh of meshes) {
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    mesh.geometry = geom;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    // Geometry is baked into world space and the mesh's local transform is now a
    // fixed identity that never changes again — so skip per-frame local-matrix
    // recomposition. Its WORLD matrix still updates when a moving parent forces
    // it (the logo meshes ride the animated logoGroup).
    mesh.matrixAutoUpdate = false;
    if (material) mesh.material = material;
    group.add(mesh);
    geom.computeBoundingBox();
    bbox.union(geom.boundingBox);
  }
  return bbox;
}

// ─── Apply functions ─────────────────────────────────────────────────────────
function applyColors() {
  renderer.setClearColor(new THREE.Color(params.bg), 1);
  applyLightColors();
  if (layout.floorMesh) layout.floorMesh.material.color.set(params.floorColor);
  outlinePass.edgeGlow      = params.outlineGlow;
  outlinePass.edgeThickness = params.outlineThickness;
  outlinePass.visibleEdgeColor.set(params.outlineColor);
  outlinePass.hiddenEdgeColor.set(params.outlineColor);
}

function applyLayout() {
  if (!layout.ready) return;

  const glbScale = params.floorRadius / layout.measuredFloorRadius;
  floorGroup.scale.setScalar(glbScale);
  logoGroup.scale.setScalar(glbScale * params.logoExtraScale);

  const yShift      = params.floorTargetY - layout.floorBboxMaxY * glbScale;
  const logoYAdjust = -layout.logoBboxMinY * glbScale * (params.logoExtraScale - 1);

  floorBase.set(
    -layout.floorCenter.x * glbScale,
    yShift,
    params.sceneZ - layout.floorCenter.z * glbScale,
  );
  logoBase.set(
    -layout.floorCenter.x * glbScale * params.logoExtraScale,
    yShift + logoYAdjust + params.logoLiftY,
    params.sceneZ - layout.floorCenter.z * glbScale * params.logoExtraScale,
  );

  floorGroup.position.copy(floorBase);
  logoGroup.position.copy(logoBase);
  logoGroup.rotation.y = params.logoRotationY * DEG_TO_RAD;

  // Don't override the in-flight logo animation with the resting position.
  if (logoAnim.phase === 'run') logoGroup.position.y = logoAnim.currentY;

  updateLightPositions();
  updateCamera();
}

// ─── Responsive framing ──────────────────────────────────────────────────────
// Keeps the aspect correct and, on narrow (portrait/tablet) viewports, pulls the
// camera back so the whole floor dish still fits — full composition visible,
// just smaller, with no wide-angle distortion.
function updateFraming() {
  const a = viewportW() / viewportH();
  camera.aspect = a;
  camera.fov    = params.fov;
  const pull    = Math.max(1, params.framingRefAspect / a); // >1 only when narrower than ref
  const factor  = 1 + (pull - 1) * params.portraitFit;
  camDistanceEff = params.cameraDistance * factor;
  camera.updateProjectionMatrix();
  updateCamera();
}

// The camera is FIXED — no scroll, no orbit. It only needs repositioning when
// the layout lands (logoBase becomes real) or the viewport changes camDistanceEff,
// so this runs on those two events instead of every frame.
const lookTarget = new THREE.Vector3();
function updateCamera() {
  const restLookY = logoBase.y + params.lookOffsetY;
  lookTarget.set(
    logoBase.x + params.lookOffsetX,
    restLookY,
    logoBase.z + params.lookOffsetZ,
  );
  camera.position.set(
    lookTarget.x,
    restLookY + params.cameraHeight,
    lookTarget.z + camDistanceEff,
  );
  camera.lookAt(lookTarget);
}

// ─── Initial application ─────────────────────────────────────────────────────
rebuildLights();
applyColors();
updateFraming();

// ─── GLB load ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

// The GLB is shared with the sibling scene, so it still contains the three
// `Screen_*` planes and the upper `Circle` ceiling piece. Both are classified
// here and then simply never added to the scene — they cost a few KB of download
// and one Draco decode, and nothing at all per frame.
function classifyMesh(name) {
  const n = name || '';
  if (/^curve/i.test(n))  return 'logo';
  if (/^screen/i.test(n)) return 'video';   // recognised, then dropped
  if (/^circle/i.test(n)) return 'floor';
  // Legacy ring-N fallback.
  const m = /ring[\-_\s]*([0-9]+)/i.exec(n);
  if (m) {
    const r = parseInt(m[1], 10);
    if (r === 1) return 'floor';
    if (r >= 2 && r <= 6) return 'video';
    if (r === 7) return 'logo';
  }
  return null;
}

loader.load(`${ASSET_BASE}test_3_.glb`, (gltf) => {
  gltf.scene.updateMatrixWorld(true);

  const meshInfos = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const worldBox = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    meshInfos.push({ mesh: o, worldBox, kind: classifyMesh(o.name) });
  });
  if (meshInfos.length === 0) { console.error('GLB has no meshes.'); return; }

  const logoMeshes = meshInfos.filter((i) => i.kind === 'logo').map((i) => i.mesh);
  // Floor pieces sorted by Y center, lowest first. The GLB's shell is two
  // pieces: [0] = the floor dish, [last] = the ceiling. We keep ONLY [0]; the
  // ceiling is part of the "background" the brief asks to remove.
  const floorInfos = meshInfos
    .filter((i) => i.kind === 'floor')
    .sort((a, b) => {
      const ay = (a.worldBox.max.y + a.worldBox.min.y) / 2;
      const by = (b.worldBox.max.y + b.worldBox.min.y) / 2;
      return ay - by;
    });
  const floorMesh = floorInfos.length ? floorInfos[0].mesh : null;

  const unmatched = meshInfos.filter((i) => i.kind == null);
  if (unmatched.length) {
    console.warn('Unrecognized meshes (ignored):', unmatched.map((u) => u.mesh.name).join(', '));
  }

  if (!floorMesh) {
    console.warn('No floor mesh found — scaling will be off.');
    layout.measuredFloorRadius = 1;
  } else {
    floorMesh.material = new THREE.MeshStandardMaterial({
      color:     params.floorColor,
      metalness: params.floorMetalness,
      roughness: params.floorRoughness,
      side:      THREE.DoubleSide,
    });
  }

  layout.floorMesh  = floorMesh;
  layout.logoMeshes = logoMeshes;

  const logoBbox = bakeIntoGroup(logoMeshes, logoGroup, logoMaterial);
  if (floorMesh) bakeIntoGroup([floorMesh], floorGroup, null);

  if (!logoBbox.isEmpty()) {
    layout.logoBboxMinY = logoBbox.min.y;
    // Feed the logo's local Y bounds to the gradient shader. bakeIntoGroup has
    // already baked matrixWorld into the geometry, so these bounds are in exactly
    // the space the vertex shader's `position.y` reads.
    logoGradientUniforms.uMinY.value = logoBbox.min.y;
    logoGradientUniforms.uMaxY.value = logoBbox.max.y;
  }

  if (floorMesh) {
    const floorOnly = floorMesh.geometry.boundingBox;
    layout.measuredFloorRadius = Math.max(
      floorOnly.max.x - floorOnly.min.x,
      floorOnly.max.z - floorOnly.min.z,
    ) / 2;
    floorOnly.getCenter(layout.floorCenter);
    layout.floorBboxMaxY = floorOnly.max.y;
  }
  layout.ready = true;

  applyLayout();

  // ── Freeze static transforms (perf; provably zero visual change) ──────────
  // floorGroup / ringGroup / the spot targets are transformed exactly once, by
  // applyLayout() / rebuildLights(). Bake their current local matrix and stop
  // per-frame recomposition. Combined with the scene-root freeze above, the only
  // matrix that churns each frame is the logo's.
  [floorGroup, ringGroup, logoSpotTarget,
   floorSpot, floorSpotTarget, fillSpot, fillSpotTarget].forEach((o) => {
    if (!o) return;
    o.updateMatrix();            // ensure .matrix holds the final local transform…
    o.matrixAutoUpdate = false;  // …then stop recomposing it every frame
  });

  outlinePass.selectedObjects = logoGroup.children.slice();

  // Park the logo below the floor until the intro plays, so the loader doesn't
  // lift and reveal a logo that is already sitting at its resting height. It is
  // opaque down there (no opacity fade any more) but out of frame — the floor dish
  // is between it and the camera.
  logoGroup.position.y = logoBase.y - params.logoAnimRise;

  revealScene();
}, undefined, (err) => console.error('GLB load failed:', err));

// ─── Logo interaction ────────────────────────────────────────────────────────
// The only interaction in this scene. Desktop: the logo leans away from the
// cursor. Touch: drag and hold to turn it. Both ported from the sibling scene per
// review 2026-08-01, and both feed the SAME damped yaw so they can never fight.
// ndcMouse is normalised device coords over the WINDOW (not the mount element) so
// the tilt tracks the cursor across the whole page.
const ndcMouse = new THREE.Vector2();
let logoTiltX = 0;   // damped tilt, radians about the WORLD X axis
let logoTiltY = 0;   // damped tilt, radians about the WORLD Y axis
// Scratch objects for composing the logo's orientation (allocated once — animate
// runs every frame).
const AXIS_Y        = new THREE.Vector3(0, 1, 0);
const logoFaceQuat  = new THREE.Quaternion();
const logoTiltQuat  = new THREE.Quaternion();
const logoTiltEuler = new THREE.Euler();

window.addEventListener('pointermove', (e) => {
  ndcMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  ndcMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}, { passive: true });

// ─── Touch drag → spin the logo (mobile) ─────────────────────────────────────
// The mouse TILT can't work on touch (there is no hover, so ndcMouse stays 0,0),
// so phones get the equivalent gesture: drag and hold to turn the logo. Same feel
// and same params as the sibling — a horizontal swipe yaws the logo, it eases
// rather than snapping to the finger, and it returns to rest on release.
//
// TOUCH events, not POINTER events — this is the one place this scene deliberately
// diverges from the sibling's implementation, and it is not a preference:
//   • The sibling drives the drag off pointerdown/pointermove and relies on
//     `touch-action: pan-y` to stop the browser claiming the gesture for panning
//     (which fires pointercancel and kills the pointer stream mid-drag).
//   • touch-action is read off the element the touch HIT. This scene's Webflow
//     markup gives #ccn-canvas `pointer-events:none` so the canvas can't swallow
//     clicks on overlaid buttons — and pointer-events inherits, so neither the
//     mount nor the canvas is ever the hit target and their `pan-y` never applies.
//     Verified: with that markup the pointer-based drag does nothing at all.
//   • touchmove keeps firing right through a browser pan. Driving off touch events
//     therefore needs no cooperation from the host page's CSS at all.
// The trade-off is that we no longer get the browser's scroll/pan axis lock for
// free, so dragAxis below reimplements it — which also makes a diagonal scroll
// swipe leave the logo alone instead of wobbling it.
let dragYawTarget = 0;         // radians, added onto the tilt's yaw target
let dragTouchId   = null;      // identifier of the tracked touch (null = idle)
let dragStartX    = 0;
let dragStartY    = 0;
let dragStartYaw  = 0;
let dragAxis      = 'idle';    // 'idle' | 'undecided' | 'x' (ours) | 'y' (page scroll)
const DRAG_AXIS_LOCK_PX = 8;   // travel before the gesture's axis is decided

function findTouch(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
  return null;
}

function dragBegin(e) {
  if (dragTouchId !== null) return;        // already tracking a finger
  const t = e.changedTouches[0];
  if (!t) return;
  dragTouchId  = t.identifier;
  dragStartX   = t.clientX;
  dragStartY   = t.clientY;
  dragStartYaw = dragYawTarget;            // continue from where it currently sits
  dragAxis     = 'undecided';
}
function dragMove(e) {
  if (dragTouchId === null) return;
  const t = findTouch(e.touches, dragTouchId);
  if (!t) return;
  if (dragAxis === 'undecided') {
    const dx = Math.abs(t.clientX - dragStartX);
    const dy = Math.abs(t.clientY - dragStartY);
    if (Math.max(dx, dy) < DRAG_AXIS_LOCK_PX) return;   // too early to tell
    dragAxis = dx > dy ? 'x' : 'y';
    if (dragAxis !== 'x') return;          // vertical: it's the page's scroll, not ours
    // Re-anchor to where the axis was decided so the yaw starts from 0 and the
    // logo doesn't jump by the lock distance.
    dragStartX = t.clientX;
    return;
  }
  if (dragAxis !== 'x') return;
  // Normalise by viewport width so the gesture feels the same on any screen: a
  // full screen-width swipe is logoDragYawDeg of turn.
  const frac = (t.clientX - dragStartX) / Math.max(1, window.innerWidth);
  const max  = params.logoDragMaxDeg * DEG_TO_RAD;
  dragYawTarget = Math.max(-max, Math.min(max,
    dragStartYaw + frac * params.logoDragYawDeg * DEG_TO_RAD));
}
function dragEnd(e) {
  if (dragTouchId === null) return;
  if (findTouch(e.touches, dragTouchId)) return;   // that finger is still down
  dragTouchId   = null;
  dragAxis      = 'idle';
  dragYawTarget = 0;        // ease back to rest (animate() damps it, so no snap)
}
window.addEventListener('touchstart',  dragBegin, { passive: true });
window.addEventListener('touchmove',   dragMove,  { passive: true });
window.addEventListener('touchend',    dragEnd,   { passive: true });
window.addEventListener('touchcancel', dragEnd,   { passive: true });

// ─── Resize ──────────────────────────────────────────────────────────────────
function onResize() {
  updateFraming();  // aspect + responsive pull-back for portrait/tablet (also re-places the camera)
  // Re-apply the CURRENT renderScale at the new viewport size (updateStyle=false
  // — CSS keeps the canvas at 100% of its container). Routing through
  // applyRenderScale rather than hardcoding the base pixel ratio is essential:
  // this handler also fires on the mobile URL-bar show/hide (via visualViewport),
  // and hardcoding BASE_PR would snap resolution back to full mid-session,
  // undoing an adaptive downscale.
  applyRenderScale();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
// visualViewport fires on mobile URL-bar show/hide and rotation, where the plain
// resize event is unreliable — keeps the canvas/aspect locked to the real screen.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onResize);
}

// ─── Render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
// Visibility gating: the loop runs ONLY while the scene is both on-screen and
// the tab is foreground, so the GPU work actually stops when scrolled away or
// backgrounded (saves battery / frees frame budget for the rest of the page).
let rafId       = null;
let running     = false;
let onscreen    = true;              // set for real by the observer's first callback
let pageVisible = !document.hidden;
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 30);

  // ── Intro (time-based, plays once) ───────────────────────────────────────
  // The rise is the whole intro (no opacity fade); the outline — if it is ever
  // switched back on — kicks in at the halfway point, and the spotlights ramp
  // over their own longer duration.
  let introEased = 0, outlineRamp = 0, spotEased = 0;
  if (logoAnim.phase === 'run') {
    const elapsed       = performance.now() / 1000 - logoAnim.phaseStart;
    const introProgress = Math.min(1, elapsed / params.logoAnimDuration);
    introEased  = 1 - Math.pow(1 - introProgress, 3);      // easeOutCubic
    const ot    = Math.max(0, (introProgress - 0.5) * 2);  // outline kicks in at halfway
    outlineRamp = 1 - Math.pow(1 - ot, 3);
    const spotProgress = Math.min(1, elapsed / params.spotAnimDuration);
    spotEased   = 1 - Math.pow(1 - spotProgress, 3);
  }

  // Tilt runs constantly (it does not wait for the intro). The logo leans AWAY
  // from the cursor:
  //   cursor right (+x) → +Y rotation, swinging the logo's +X edge to −Z, i.e.
  //                       the right edge goes back and the left comes forward;
  //   cursor high  (+y) → −X rotation, sending the top edge back the same way.
  // On touch there is no hover, so ndcMouse stays (0,0) and the mobile params zero
  // both amounts — the drag is the only thing that moves it there. The drag adds
  // onto the same yaw, so both paths share one damped value. While a finger is
  // down (or easing back after release) use the gentler logoDragRate.
  const yawRate = (dragTouchId !== null || Math.abs(dragYawTarget - logoTiltY) > 1e-4)
    ? params.logoDragRate
    : params.logoTiltRate;
  logoTiltX = damp(logoTiltX, -ndcMouse.y * params.logoTiltPitchDeg * DEG_TO_RAD, params.logoTiltRate, dt);
  logoTiltY = damp(
    logoTiltY,
    ndcMouse.x * params.logoTiltYawDeg * DEG_TO_RAD + dragYawTarget,
    yawRate, dt,
  );

  if (logoAnim.phase === 'run') {
    const riseOffsetY = -(1 - introEased) * params.logoAnimRise;
    logoAnim.currentY = logoBase.y + riseOffsetY;
    logoGroup.position.set(logoBase.x, logoAnim.currentY, logoBase.z);
    // Orientation = tilt ∘ base facing. The tilt is composed on the LEFT so it
    // applies in PARENT space: logoGroup's parent is the untransformed scene root,
    // so parent space IS world space and the tilt axes line up with the screen.
    // Writing the tilt into logoGroup.rotation instead would tilt around the
    // logo's already-rotated LOCAL axes (logoRotationY = 90°), which turns the
    // intended left/right lean into a forward/back rock.
    logoFaceQuat.setFromAxisAngle(AXIS_Y, params.logoRotationY * DEG_TO_RAD);
    logoTiltEuler.set(logoTiltX, logoTiltY, 0);
    logoTiltQuat.setFromEuler(logoTiltEuler);
    logoGroup.quaternion.copy(logoTiltQuat).multiply(logoFaceQuat);
    outlinePass.edgeStrength = params.outlineStrength * outlineRamp;
    // SKIP the whole OutlinePass while it contributes nothing. At edgeStrength 0
    // the pass is invisible, but it still costs TWO full-scene re-renders plus
    // ~7 fullscreen passes on HalfFloat RTs every frame — by far the heaviest
    // thing in the chain. Genuinely invisible before the intro ramp starts.
    outlinePass.enabled = params.outlineEnabled && outlinePass.edgeStrength > 0.001;
    if (logoSpot)  logoSpot.intensity  = params.ringIntensity      * spotEased;
    if (floorSpot) floorSpot.intensity = params.floorSpotIntensity * spotEased;
    if (fillSpot)  fillSpot.intensity  = params.fillIntensity      * spotEased;
  }

  // ── Adaptive resolution monitor (GPU timer query) ────────────────────────
  // Only ONE query is ever in flight — poll the previously-issued one here, then
  // (below) issue the next one around the render.
  if (rsExt && rsQuery !== null) {
    if (gl.getParameter(rsExt.GPU_DISJOINT_EXT)) {
      // The GPU timer was disturbed this interval → every in-flight timing is
      // invalid. Discard this query without touching the EMA.
      gl.deleteQuery(rsQuery);
      rsQuery = null;
    } else if (gl.getQueryParameter(rsQuery, gl.QUERY_RESULT_AVAILABLE)) {
      const gpuMs = gl.getQueryParameter(rsQuery, gl.QUERY_RESULT) / 1e6;  // ns → ms
      gl.deleteQuery(rsQuery);
      rsQuery = null;
      if (rsWarmup > 0) {
        rsWarmup--;                    // still warming up — ignore this sample
      } else if (rsSettle > 0) {
        rsSettle--;                    // perturbed by a recent realloc/resume — skip it
      } else {
        if (rsSeeded) rsGpuMs += (gpuMs - rsGpuMs) * 0.1;
        else { rsGpuMs = gpuMs; rsSeeded = true; }
        if (rsCooldown > 0) rsCooldown--;
        rsOverCount  = rsGpuMs > RS_BUDGET_MS   ? rsOverCount + 1  : 0;
        rsUnderCount = rsGpuMs < RS_HEADROOM_MS ? rsUnderCount + 1 : 0;

        if (rsOverCount >= RS_DOWN_SAMPLES && rsCooldown === 0 && rsIndex < RS_STEPS.length - 1) {
          rsIndex++;
          renderScale = RS_STEPS[rsIndex];
          applyRenderScale();          // (also bumps rsSettle + clears the counters)
          rsOverCount  = 0;
          rsUnderCount = 0;
          rsCooldown   = RS_COOLDOWN;
        } else if (rsUnderCount >= RS_UP_SAMPLES && rsCooldown === 0 && rsIndex > 0) {
          rsIndex--;
          renderScale = RS_STEPS[rsIndex];
          applyRenderScale();
          rsOverCount  = 0;
          rsUnderCount = 0;
          rsCooldown   = RS_COOLDOWN;
        }
      }
    }
  }

  // Wrap the frame's GPU render section in ONE timer query — only when the
  // extension is supported AND no query is still pending (never nest; only one
  // TIME_ELAPSED query may be active at a time).
  const rsTiming = rsExt !== null && rsQuery === null;
  if (rsTiming) {
    rsQuery = gl.createQuery();
    gl.beginQuery(rsExt.TIME_ELAPSED_EXT, rsQuery);
  }
  composer.render();
  if (rsTiming) gl.endQuery(rsExt.TIME_ELAPSED_EXT);

  updateHud();   // no-op unless ?perf is in the URL
}

// Start the loop only when both signals are true. Idempotent: the running guard
// prevents ever scheduling two concurrent rAF loops. Discard the stale delta
// accrued while paused so the first resumed frame doesn't get a huge dt.
function startLoop() {
  if (running) return;
  running = true;
  clock.getDelta();
  // Reset the adaptive-resolution GPU-timer signal on resume: after a long idle
  // the timer state is untrustworthy, so discard any pending query and the
  // EMA/counters so a post-pause spike can't cause a spurious downscale.
  if (rsQuery !== null) { gl.deleteQuery(rsQuery); rsQuery = null; }
  rsGpuMs      = 0;
  rsSeeded     = false;
  rsOverCount  = 0;
  rsUnderCount = 0;
  rsSettle     = Math.max(rsSettle, RS_SETTLE);
  rafId = requestAnimationFrame(animate);
}

// Fully stop the loop — cancel the pending frame so the GPU work actually ceases.
function stopLoop() {
  if (!running) return;
  running = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// Single source of truth: render only when on-screen AND the tab is foreground.
function syncLoop() {
  if (onscreen && pageVisible) startLoop();
  else stopLoop();
}

// Observe the mount element; kept alive for the page lifetime (never disconnected).
const loopObserver = new IntersectionObserver((entries) => {
  onscreen = entries[entries.length - 1].isIntersecting;
  syncLoop();
  maybeStartIntro();   // first time the (already loaded) scene scrolls into view
});
loopObserver.observe(appEl);

document.addEventListener('visibilitychange', () => {
  pageVisible = !document.hidden;
  syncLoop();
});

syncLoop();
