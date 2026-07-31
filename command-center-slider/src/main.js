import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

RectAreaLightUniformsLib.init();

// ─── Performance tier (mobile vs desktop) ───────────────────────────────────
// Mobile GPUs choke on full-resolution planar reflectors and high MSAA. Gate
// the heavy stuff off them, and clamp pixel ratio so the canvas doesn't
// render at 3× on phones.
const IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Mobile/i.test(navigator.userAgent);
const PIXEL_RATIO_CAP    = IS_MOBILE ? 1   : 1.5;
// MSAA smooths geometry edges (screen borders, logo silhouette). Mobile used to
// ask for 4× — MORE than desktop's 2× — on the theory that the 8-bit RT made it
// affordable. It doesn't: MSAA multiplies the framebuffer's BANDWIDTH by the
// sample count regardless of bit depth. That is nearly free on Apple's tile-based
// GPUs (MSAA resolves in on-chip tile memory) but costs real main-memory traffic
// on the Adreno/Mali parts in Android phones — which is a large part of why the
// same build ran acceptably on iOS and crawled on Android. 2× everywhere.
const MSAA_SAMPLES       = 2;
// Reflectors render the whole scene into a texture — the biggest GPU cost. On
// mobile keep ONLY the floor mirror (so the videos still read as reflected) at a
// lower RT scale (it only needs to look "reflective", not crisp), and drop the
// ceiling mirror (a second full-scene render is too expensive on phones).
// The RT scale is also the mirrors' PRIMARY blur control, and the only one that
// widens the blur without touching brightness or colour. A smaller RT bilinearly
// upsampled is a true low-pass with no undersampling — unlike widening a sparse
// fixed-tap kernel, which just ghosts. So softness comes from here plus a modest
// texel-spaced kernel below, never from dimming or tinting the reflection.
// Dropped 0.5→0.15 desktop / 0.3→0.14 mobile (also much cheaper to render).
// Measured: at 0.5 the mirrored on-screen TEXT was legible in the floor; at 0.15
// nothing in the reflection resolves as content, only soft glows.
const REFLECTOR_RT_SCALE   = IS_MOBILE ? 0.14 : 0.15;
const ENABLE_FLOOR_REFLECTOR = true;         // floor mirror on both (mobile at reduced RT)
const ENABLE_ROOF_REFLECTOR  = !IS_MOBILE;   // ceiling mirror desktop-only
// Reflectors re-render the WHOLE scene into a texture every frame — a big per-
// frame GPU cost. Half-rating (2 = every other frame) is possible, BUT the hero's
// mirrors reflect the bright, animated video screens (high temporal frequency),
// so a 30fps mirror visibly FLICKERS here. Kept at 1 (every frame) for a stable
// reflection; the override-material guard below still drops a wasted per-frame
// depth re-render. (The footer's blurred/faded reflection does tolerate 2.)
const REFLECTION_EVERY = 1;
// Blur kernel radius for the frosted hover mask: 5×5 (25 taps) on desktop, 3×3
// (9 taps) on mobile — this shader runs on every video-plane fragment every
// frame, so trimming taps directly helps the video phase where mobile lags.
// Desktop 5×5 (25 taps). Mobile 1 tap (no blur): the mask never fades on mobile
// (no hover), so its frosted blur is never visible there — but it costs texture
// reads on every fragment of all 3 screens, exactly at the video phase where
// mobile is slowest. Dropping to 1 tap is free visually and cuts that fill.
const MASK_KERNEL_R    = IS_MOBILE ? 0 : 2;
const MASK_KERNEL_TAPS = (2 * MASK_KERNEL_R + 1) * (2 * MASK_KERNEL_R + 1);

// ─── Mount target + viewport sizing ─────────────────────────────────────────
// Mount into the Webflow container (#cc-canvas, absolute-filling the sticky
// section) when embedded, or the local #app scaffold for `npm run dev`. All
// sizing is driven off this element's client size rather than window.innerHeight
// (which shrinks/grows as the mobile URL bar shows/hides) so the canvas stays
// locked to its container and scrolling never exposes a gap.
const appEl = document.getElementById('cc-canvas') || document.getElementById('app');
const viewportW = () => appEl.clientWidth  || window.innerWidth;
const viewportH = () => appEl.clientHeight || window.innerHeight;

// ─── Renderer ────────────────────────────────────────────────────────────────
// alpha:true so the canvas can become transparent in the empty well below the
// floor — the DOM text + global background-lines canvas behind it then show
// THROUGH, while the opaque logo stays in front (clearAlpha is animated in
// animate()). Above the floor the clear alpha is 1, so the dark room hides
// everything behind (incl. the gaps between screens).
// antialias:false — all scene geometry renders through the EffectComposer into an
// MSAA render target (composerRT, `samples` above) and only a fullscreen quad
// (OutputPass) hits the default framebuffer, so the renderer's own MSAA would
// anti-alias nothing but that quad's screen-border edge. Dropping it is free.
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
// ─── Adaptive resolution state ────────────────────────────────────────────────
// BASE_PR is the full-quality (capped) device pixel ratio. renderScale multiplies
// it: 1.0 = full DPR, byte-identical to the non-adaptive path. The controller in
// animate() steps renderScale DOWN through RS_STEPS only when the TRUE GPU frame
// time (measured with a timer query) stays over budget, and reclaims a step UP when
// the measured GPU cost shows sustained headroom (see the monitor). On a GPU that
// holds the frame budget it stays pinned at 1.0 forever (every render target keeps
// its full-DPR size), so output is identical to today.
const BASE_PR = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP);
let renderScale = 1;
const RS_STEPS  = [1.0, 0.85, 0.72, 0.6];
let rsIndex     = 0;
renderer.setPixelRatio(BASE_PR);
renderer.setClearColor(0x010101, 1);  // dark; applyColors() resets it from params.bg once params exist
// updateStyle=false: we only drive the drawing-buffer size and set the canvas
// CSS to fill its container ourselves (below), so it works whether or not the
// host page has a `#app canvas { width:100% }` rule.
renderer.setSize(viewportW(), viewportH(), false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.display = 'block';
renderer.domElement.style.width   = '100%';
renderer.domElement.style.height  = '100%';
// REQUIRED for the touch-drag logo spin to work at all (review round 8). With the
// default `touch-action: auto`, the browser claims a touch gesture for panning as soon
// as the finger moves and STOPS delivering pointermove (it fires pointercancel instead),
// so the drag handler never saw anything on a real phone. `pan-y` hands vertical
// panning — the page scroll that drives this whole scene — to the browser while leaving
// HORIZONTAL movement to us, which is exactly the split the drag needs.
renderer.domElement.style.touchAction = 'pan-y';
appEl.appendChild(renderer.domElement);

// ─── Loader overlay (plain black, hides the canvas until assets are ready) ──
const loaderEl = document.createElement('div');
loaderEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;transition:opacity 0.6s ease-out';
document.body.appendChild(loaderEl);

// ─── Floor "concrete" blackout ──────────────────────────────────────────────
// As the camera passes DOWN through the (hollow) floor, fade the whole view to
// black — like sinking into solid concrete — then fade back to reveal the logo
// below. Opacity is driven per-frame from the camera height vs the floor.
const blackoutEl = document.createElement('div');
// High z-index so it covers the (now high-z-index in Webflow) scene canvas during
// the floor crossing — it must hide the hollow-floor see-through. opacity:0 +
// pointer-events:none the rest of the time, so it's invisible and never blocks.
blackoutEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;pointer-events:none;opacity:0';
document.body.appendChild(blackoutEl);

// ─── Perf HUD (opt-in: add ?perf to the URL, or set window.CC_PERF) ──────────
// There are no DevTools on a phone, so this is how the mobile tier gets VERIFIED
// instead of guessed at. Off unless explicitly asked for — it creates no element
// and costs nothing in production. Note `gpu` reads n/a on Safari/iOS: the
// EXT_disjoint_timer_query_webgl2 extension isn't exposed there, which is also why
// the adaptive-resolution controller is disabled on iOS (renderScale pinned 1.0).
const PERF_HUD = /[?&]perf\b/.test(location.search) || !!window.CC_PERF;
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
    `smaa     ${IS_MOBILE ? 'off' : 'on'}   reflectorRT ${REFLECTOR_RT_SCALE}`;
}

const loadingState = {
  glb:    false,
  videos: [],    // sized after GLB ready
  done:   false,
};

// Single-phase intro: rises the logo, fades opacity 0→1, and ramps the
// OutlinePass strength 0→params.outlineStrength all on the same timeline.
const logoAnim = { phase: 'idle', phaseStart: 0, currentY: 0 };

function checkAllLoaded() {
  if (loadingState.done) return;
  if (!loadingState.glb) return;
  if (loadingState.videos.length === 0) return; // not yet sized
  if (!loadingState.videos.every(Boolean)) return;
  loadingState.done = true;
  startLogoAnimation();
  loaderEl.style.opacity = '0';
  setTimeout(() => loaderEl.remove(), 700);
}

// Safety net: if a video stalls forever, reveal anyway after 20s.
setTimeout(() => {
  if (!loadingState.done) {
    console.warn('Loader timeout — revealing scene');
    loadingState.done = true;
    startLogoAnimation();
    loaderEl.style.opacity = '0';
    setTimeout(() => loaderEl.remove(), 700);
  }
}, 20000);

function startLogoAnimation() {
  if (!layout.ready) return;
  logoAnim.phase      = 'run';
  logoAnim.phaseStart = performance.now() / 1000;
  logoAnim.currentY   = logoBase.y - params.logoAnimRise;
  logoGroup.position.y     = logoAnim.currentY;
  // Opaque from frame one — the intro is the rise only, no opacity fade (review 2).
  // `transparent` stays true because the EXIT still fades this out under the shell.
  logoMaterial.transparent = true;
  logoMaterial.opacity     = 1;
  outlinePass.edgeStrength = 0;
  if (logoSpot) logoSpot.intensity = 0;
}

// ─── Scene + camera + lights ─────────────────────────────────────────────────
const scene = new THREE.Scene();
// No scene.background — we drive the clear color/alpha on the renderer instead,
// so the canvas can go transparent in the empty well (see the renderer + animate).
scene.background = null;
// This Scene is a pure identity root: nothing ever transforms `scene` itself
// (verified — there are no scene.position/rotation/scale writes anywhere). With
// matrixAutoUpdate ON, the root sets matrixWorldNeedsUpdate every frame, which
// force-recomputes the world matrix of the ENTIRE object tree each frame. Turning
// it OFF stops that root force. matrixWorldAutoUpdate stays ON, so the renderer
// still walks the graph, and the ANIMATED nodes (logoGroup, videosPivot) — which
// keep matrixAutoUpdate ON and thus set their own matrixWorldNeedsUpdate — still
// update and still force their own subtrees. The static nodes frozen below then
// truly stop recomputing matrices per frame. Provably zero visual change.
scene.matrixAutoUpdate = false;

const camera = new THREE.PerspectiveCamera(55, viewportW() / viewportH(), 0.1, 100);
// Layer 1 = "main view only" — used for the hover masks so the planar
// reflectors (whose virtual camera defaults to layer 0) don't see the dark
// red mask covering the videos. The reflection then shows the bare video
// textures instead of a smear of mask color.
const LAYER_MAIN_ONLY = 1;
camera.layers.enable(LAYER_MAIN_ONLY);

// Effective camera distance — updated by updateFraming() from the viewport
// aspect (pulled back on portrait so the ring fits). Used in animate().
let camDistanceEff = 4;

// World-space gap between the camera's optical axis and the resting logo at the
// bottom of the descent. NOT a constant: updateFraming() recomputes it from the
// current aspect so the logo lands at the SAME on-screen height on every
// viewport (see params.logoRestNdcY). Used in animate().
let logoRestGap = 0;

// ─── Postprocessing (EffectComposer) ────────────────────────────────────────
// EffectComposer renders into an offscreen RT, which bypasses the renderer's
// own MSAA. Give the composer its own RT with MSAA (samples) so geometry edges
// (screen borders, logo silhouette) and the OutlinePass' thin neon edges don't
// ladder. Desktop uses HalfFloatType (headroom for any future HDR pass); mobile
// uses UnsignedByteType (8-bit) — far lower bandwidth, a big win on weaker
// Android GPUs that are slow with float render targets. No HDR pass is in the
// chain, so 8-bit clips nothing visible.
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
outlinePass.edgeStrength    = 4.0;
outlinePass.edgeGlow        = 0.8;
outlinePass.edgeThickness   = 1.0;
// Desktop keeps full-res edge buffers (1) — that's what kills the neon-outline
// stairs on the logo. Mobile uses 2 (half-res per axis = a QUARTER of the
// pixels). This is the single biggest mobile win in the whole chain: three's
// OutlinePass hardcodes HalfFloatType on 5 of its 7 internal buffers
// (depth / maskDownSample / blur1 / edge1 at resx,resy + blur2 / edge2 at half),
// so at downSampleRatio 1 it hands the GPU full-resolution FLOAT16 render
// targets — exactly what composerRT's UnsignedByteType below is trying to avoid
// on weak Android GPUs. Note three's own default is 2, and it is applied in the
// CONSTRUCTOR, so on mobile this needs no RT reallocation at all.
outlinePass.downSampleRatio = IS_MOBILE ? 2 : 1;
// Start DISABLED — animate() turns it on the frame edgeStrength goes above 0.
// Until the intro ramp begins there's no outline to draw, so the pass' two
// full-scene re-renders + full-res HalfFloat blur chain would be pure waste
// (it's the most expensive pass in the chain — see the gating in animate()).
outlinePass.enabled = false;
outlinePass.visibleEdgeColor.set('#f95921');
outlinePass.hiddenEdgeColor.set('#f95921');
composer.addPass(outlinePass);
// SMAA smooths the outline's post-process edges (which MSAA can't touch since
// they're drawn after the resolved render pass). DESKTOP ONLY: it's three more
// full-resolution fullscreen passes, and on mobile the geometry edges are already
// covered by the MSAA render target while the outline itself is now half-res
// (downSampleRatio 2) — so SMAA was paying full-res bandwidth to sharpen
// something that no longer has full-res detail to sharpen. On a phone the outline
// glow edges ladder a touch without it; that is the trade for three passes.
if (!IS_MOBILE) {
  const pr = renderer.getPixelRatio();
  composer.addPass(new SMAAPass(viewportW() * pr, viewportH() * pr));
}
composer.addPass(new OutputPass());

// ─── Adaptive resolution controller ───────────────────────────────────────────
// applyRenderScale() re-applies the current renderScale to the whole chain. The
// controller lives in animate(). It judges load on the TRUE GPU frame time — read
// with an EXT_disjoint_timer_query_webgl2 timer query wrapped around the frame's
// render — NOT on the requestAnimationFrame interval. The rAF interval is bounded
// below by vsync (~16.7ms @60Hz), so it can't tell a fast GPU (2ms) from one just
// coping (16ms) on a 60Hz panel, and a stray frame there wrongly downscales even a
// very capable GPU. The measured GPU cost is vsync-INDEPENDENT: a fast GPU reads
// its real ~1-3ms (never over the 13ms budget → never downscales) and a struggling
// GPU reads its real >13ms and steps down; headroom is directly measured (no probe
// needed) so recovery is a straight up-step when the EMA sits below the headroom
// threshold. If the extension is unavailable (rsExt === null, e.g. Safari) the
// controller is fully DISABLED — renderScale stays 1.0 forever (full quality).
// Warmup/resume/resize samples are skipped so transient spikes can't move it.
const gl    = renderer.getContext();
// EXT_disjoint_timer_query_webgl2 exposes TIME_ELAPSED_EXT queries (true GPU time)
// on WebGL2. null on browsers that don't expose it (Safari) → controller disabled.
const rsExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

const RS_BUDGET_MS    = 13;  // sustained EMA above this (ms of GPU time) ⇒ over budget → downscale
const RS_HEADROOM_MS  = 8;   // sustained EMA below this ⇒ clear headroom → upscale (deadband 8–13ms)
const RS_DOWN_SAMPLES = 20;  // consecutive over-budget measured samples before a downscale (short window)
const RS_UP_SAMPLES   = 60;  // consecutive headroom measured samples before an upscale (longer window)
const RS_COOLDOWN     = 45;  // min measured samples between scale changes
const RS_WARMUP       = 15;  // ignore the first measured samples (shader compile / asset warm-up)
const RS_SETTLE       = 2;   // skip a couple of measured samples after a scale change / resume / resize

let rsGpuMs      = 0;      // EMA of the true GPU frame time in ms (see RS_BUDGET_MS)
let rsSeeded     = false;  // EMA seeds on the first valid measured sample
let rsQuery      = null;   // the single TIME_ELAPSED_EXT query in flight (null = none pending)
let rsWarmup     = RS_WARMUP;
let rsSettle     = 0;      // skip N upcoming measured samples (resume / resize / RT realloc perturbs timing)
let rsOverCount  = 0;      // consecutive measured samples with EMA over budget
let rsUnderCount = 0;      // consecutive measured samples with EMA in headroom
let rsCooldown   = 0;      // measured samples remaining before another scale change is allowed

function applyRenderScale() {
  const pr = BASE_PR * renderScale;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);   // cascades pr → composerRT + OutputPass (+ SMAAPass on desktop)
  const w = viewportW(), h = viewportH();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  outlinePass.setSize(w, h);    // handles its own edge/blur RTs
  // The two Reflector RTs are deliberately NOT resized here — they stay fixed at
  // REFLECTOR_RT_SCALE. Recreating a Reflector RT hitches, so they ride through
  // scale changes untouched.
  //
  // The RT reallocation above perturbs the next couple of measured GPU timings —
  // skip them and clear the sustain counters so the controller never reads its own
  // resize hitch as over-budget frames.
  rsSettle     = Math.max(rsSettle, RS_SETTLE);
  rsOverCount  = 0;
  rsUnderCount = 0;
}

// Only the ring spotlight and the per-screen RectAreaLights illuminate the
// scene — no ambient / key / fill. Anything outside those cones stays black.

// ─── Tunable params ──────────────────────────────────────────────────────────
const params = {
  // Background / colors
  bg:             '#000000',
  gradientTop:    '#FFC34B',
  gradientBottom: '#F95921',

  floorColor1: '#a00d00',
  floorColor2: '#000000',
  floorColor3: '#000000',
  floorColor4: '#000000',
  // Reflectivity / emission
  floorMetalness: 0.5,
  floorRoughness: 1,

  // The "fantana" — the central well the logo dives through. It is part of the same
  // `Circle` mesh as the floor, so splitFloorGeometry() cuts it out to give it this
  // material of its own. (Named wellSurface* to avoid colliding with the disabled
  // procedural `well*` params further down, which are a different thing entirely.)
  // Review round 5: it read as "beton colorat" because it shared the floor's
  // reddish, rough, half-metallic material. Metal needs THREE things here, and
  // missing any one of them is what makes a metal look like painted concrete:
  //   • a near-neutral, darker albedo (a saturated red albedo reads as paint),
  //   • high metalness + low-ish roughness,
  //   • something to REFLECT. This is the one that matters most and the easiest to
  //     miss: with no environment map a metal has no diffuse term and nothing to
  //     mirror, so it renders essentially BLACK. Hence wellEnv below.
  //
  // Review round 6 — "metal ca MATERIAL, nu culoare": the well must RESPOND to the
  // video lights (visibly brighten when a screen is hovered and its RectAreaLight
  // switches from the red mask tint to the live video colour), and it must stop
  // reading as a red part pasted into a darker floor.
  // Metalness is therefore NOT 1 any more. At metalness 1 a MeshStandardMaterial has
  // NO diffuse term at all, and this well also has the area-light SPECULAR stripped
  // (dropRectAreaSpecular, review round 4 — polished metal turns those lights into
  // hard bright quads). Those two together meant the screens could not light the well
  // by ANY path, so it was completely inert to hover and its whole appearance came
  // from the static env map — which is exactly why it looked like flat red paint.
  // Keeping metalness in the 0.6–0.8 range leaves a real diffuse term for the video
  // lights to drive while the env map still supplies the metallic sheen.
  wellSurfaceMetalness:    0.7,
  wellSurfaceRoughness:    0.3,
  // Near-neutral, slightly warm so it sits with the room without being "the red bit".
  // At this metalness the albedo tints BOTH the diffuse and the reflection.
  // MUST NOT be black (or near-black). The albedo tints the diffuse AND the metallic
  // reflection, so #000000 gives a well that is both black and completely inert to
  // the video lights — i.e. it defeats the two things review round 6 asked for. There
  // is a runtime warning for this in makeWellMaterial(). Keep it a warm neutral and
  // let the LIGHTS and wellEnv* supply the colour, so it changes on hover.
  wellSurfaceColor:        '#9a9089',
  wellSurfaceEnvIntensity: 0.85,  // how strongly it mirrors wellEnv
  // Tiny synthetic environment the well metal reflects: a vertical gradient (dark
  // floor → warm ring glow → near-black ceiling) matching the room's palette. Cheap
  // enough to be free (one 64×32 canvas through PMREM, once) and it is what turns
  // the well from a black hole into something that reads as brushed metal.
  // Desaturated vs round 5: a strongly red env is what made the well read as a red
  // object rather than as metal picking up a red room. The colour should come from
  // the actual lights (so it changes on hover), not be baked in here.
  wellEnvTop:    '#a00d00',
  wellEnvMid:    '#000000',
  wellEnvBottom: '#000000',
  wellEnvHorizon: 0.42,   // 0..1 height of the warm band
  videoEmission:  8,

  // Floor planar reflector (gives a real, curved mirror reflection of the
  // screens — ring shape so the inner well around the logo isn't covered).
  //
  // ── Reflection softness (review 2026-07-31, revised after round 2) ────────
  // Two knobs, and which one to reach for matters — this took three rounds:
  //   *Blur    — kernel tap spacing in TEXELS of the reflection RT (was raw UV,
  //              which at ~5 screen px/tap under-sampled the moving video and was
  //              itself the source of the shimmer). Keep it near 1–2.5: the WIDTH
  //              should come from REFLECTOR_RT_SCALE above, because a wide sparse
  //              kernel ghosts instead of blurring. Blur alone was NOT enough —
  //              review round 3: "nu cred ca trebuie sa dai mai mult blur".
  //   *Opacity — how strongly the mirror shows AT ALL. This is the intensity knob,
  //              and the reason it works where round 1's *Strength failed is WHAT
  //              shows through underneath. *Strength mixed toward the reflector's
  //              flat tint — a mid-dark red — so it LIFTED every dark part of the
  //              mirror to a flat mid-red and the floor/ceiling read far too bright
  //              and too uniform. *Opacity instead makes the Reflector mesh
  //              genuinely transparent, so what blends through is the REAL floor /
  //              ceiling mesh (its own MeshStandardMaterial, lit by the video
  //              RectAreaLights). The surface therefore keeps its own colour and
  //              stops reading as a perfect mirror — it reads as a partly
  //              reflective floor, which is what round 3 asked for.
  //              1.0 = the original full mirror, 0 = the bare floor material.
  reflectorEnabled:    ENABLE_FLOOR_REFLECTOR,
  // OBSOLETE since review round 5 — the reflector now uses the floor's own top-surface
  // geometry, whose inner hole is the well opening, so there is nothing to configure.
  // Only read by the fallback flat ring in rebuildFloorReflector (no clean flat level).
  reflectorInnerRadius: 2.0,
  reflectorTint:       '#850f0f',
  // How far ABOVE the floor surface the mirror plane sits. This is NOT just a
  // z-fighting nudge — it has to stay reasonably large or the reflection DIES, and
  // that cost a long debugging session in review round 5, so: three's Reflector
  // replaces the virtual camera's near plane with the mirror plane (oblique
  // projection, `clipBias`). If the mirror plane is coincident with the floor MESH,
  // the floor's own huge coplanar surface sits exactly on that clip boundary, leaks
  // past it, and fills the reflection texture with the floor's dark underside — the
  // floor then renders almost black with reflections surviving only in the nearest
  // band. Was 0.001, which was fine only because the plane used to be placed at
  // floorTargetY, and floorTargetY happens to sit ~0.066 ABOVE the true floor
  // surface (yShift aligns the well collar's top, not the floor, to it). Now that the
  // plane is derived from the floor's real surface, the clearance must be explicit.
  // Symptom if set too low: floor goes black except right at the bottom of frame.
  reflectorLift:       0.05,
  reflectorBlur:       1.6,          // texels of tap spacing (was 0.0055 raw UV)
  reflectorOpacity:    0.35,

  // Roof planar reflector — same idea but flipped, and pushed further: the ceiling
  // fills the top of frame right above the logo, so it was the louder of the two.
  roofReflectorEnabled:    ENABLE_ROOF_REFLECTOR,
  roofReflectorInnerRadius: 0,
  roofReflectorTint:       '#230505',
  roofReflectorLift:       0.008,  // offset DOWN from the ceiling underside
  roofReflectorBlur:       2.2,
  roofReflectorOpacity:    0.25,

  // Logo surface (review 2026-07-31) — was a transmissive "glass/ice"
  // MeshPhysicalMaterial; it is now the brand linear gradient on a MATTE metal,
  // so the ring spotlight and the per-screen video RectAreaLights read as soft
  // reflections sliding across the logo instead of refracting through it.
  // The scene has NO ambient/key/fill light, so these three knobs together decide
  // how much of the logo is gradient and how much is light response:
  // Tuned by eye against the zoomed logo. The logo is an EXTRUSION: its big front
  // face is flat and points at the camera, while the screens sit off to the sides.
  // That geometry decides which knob does the work — a flat face aimed at the
  // camera has a mirror direction pointing back at the camera (where there is
  // nothing), so a high-metalness surface reflects black there and the face reads
  // dead flat. The screens only reach it as broad DIFFUSE area-light response, so
  // metalness is kept mid-range rather than high: the curved side walls still
  // catch metallic sheens, and the front face still brightens and darkens with the
  // video content. Raise metalness for harder, more localised glints.
  logoMetalness: 0.45,
  logoRoughness: 0.3,   // "mat": lights spread into broad sheens, not sharp glints.
                        // Lower = shinier/harder.
  // Emissive floor on the SAME gradient. 1.0 renders the authored brand colours
  // exactly (the renderer does no tone mapping, and three converts the hex through
  // linear and back out to sRGB), so this is really "how much of the pure brand
  // gradient shows with no light on it". Set high on purpose: the scene has no
  // ambient at all and the logo's flat front face catches only weak grazing light,
  // so a LOW value does not reveal more light play — it just renders the brand gold
  // as a muted olive. Kept just under 1 so the spotlight and the screens still have
  // headroom to push visibly brighter (and clip toward white on a strong hit),
  // which is what actually reads as the lights reflecting off it.
  logoSelfLit:   0.8,

  // Logo gradient — the logo's own colour AND the emissive shell it crossfades to
  // on the way out (one source of truth, so the crossfade is seamless). Brand
  // linear: warm gold at the top → burnt orange at the bottom.
  logoGradientTop:       '#FFC44B',  // color at the top of the logo
  logoGradientBottom:    '#FA6827',  // color at the bottom
  // Shifts the gradient DOWN the logo without touching either brand hex: the
  // vertical ramp t is raised to this power, so >1 lets the orange climb higher and
  // leaves the gold as a tip highlight. Review asked for "mai portocaliu" while the
  // two colours above were the ones specified, so this biases the mix rather than
  // inventing a third colour. 1 = pure linear ramp. Shared with the exit shell.
  logoGradientBias:      1.9,
  logoGradientStart:     0.5,        // exit progress (0..1) where the gradient begins to crossfade (higher = later/deeper)

  // Logo orientation + intro animation
  logoRotationY:    90,   // degrees around Y so the logo faces the camera
  logoAnimRise:     2,    // start this far BELOW logoBase, then rise to it
  logoAnimDuration: 3,    // rise + opacity fade + outline ramp all share this
  spotAnimDuration: 6,    // spotlight ramps independently over this duration

  // Logo scroll-exit — after the ring has rotated, scrolling further sinks the
  // logo back down under the ring and fades it out ("leaves the scene").
  logoExitStart:      0.25, // scroll progress (0..1) where the logo starts to leave (DESKTOP; mobile overridden below)
  logoExitEnd:        0.45, // scroll progress where the transition (gradient/camera dip) completes (DESKTOP)
  logoExitDrop:       3.5,  // camera follows the logo down this far through the floor (the transition drop)
  logoExitFollowRate: 24,   // easing rate for the exit — also smooths the intro→scroll handoff.
                            // Raised 8->24 so the logo exit tracks the page's Lenis scroll (less lag).
  logoContinueDrop:   7.5,  // beyond logoExitEnd the logo eases DOWN by this many units total and SETTLES (bounded — it does not keep falling out of view). This is a LONG descent so the camera (which follows ~cameraContinueFollow of it) travels deep past the floor/ceiling into empty black space. Bigger = deeper journey / floor leaves the frame sooner.
  logoSpinDeg:        1300,  // degrees the logo spins (like a top) per unit of scroll beyond logoExitEnd — a touch faster
  cameraFollowExit:   1.0,  // how much the camera height follows the exiting logo (0..1)
  // Where the logo COMES TO REST on screen, in NDC Y (0 = frame centre, -1 =
  // bottom edge). This is the single knob for the final position and it is
  // resolution- and aspect-INDEPENDENT: updateFraming() converts it into the
  // world-space camera/logo gap (logoRestGap) using the CURRENT camera distance,
  // and animate() derives the camera's follow fraction from that. Previously this
  // was a hardcoded world-space follow fraction (cameraContinueFollow), which
  // drifted on every aspect ratio because the portrait pull-back changes
  // camDistanceEff — perspective divides the world gap by that distance, so the
  // same gap landed at a different screen height on each viewport (and had to be
  // re-tuned by hand per device class). -0.1874 reproduces the previous DESKTOP
  // resting height exactly (0.525 world units at distance 4, fov 70).
  // Higher (toward 0) → logo more centred; lower (toward -1) → nearer the bottom.
  logoRestNdcY:       -0.1874,
  logoExitMinScale:   0.3,  // the logo shrinks to this fraction of its rest size at the bottom of the continued descent (smaller when it's far down in the empty space)

  // Logo mouse TILT — always active (does not wait for the intro). The logo leans
  // AWAY from the cursor: the edge nearest the mouse rotates back, so it reads as
  // an object you could grab and turn. Replaces the old positional parallax
  // (logoParallaxAmp/Rate), which merely slid the logo sideways and read as a
  // camera wobble rather than as the logo itself rotating.
  // Split per axis in review round 3 — it was one shared amount, which made the
  // logo rock forward/back as much as side to side. Wanted: mostly side to side.
  logoTiltYawDeg:   20,  // LEFT/RIGHT lean (rotation about world Y, driven by mouse X)
  logoTiltPitchDeg: 2.5, // FRONT/BACK lean (rotation about world X, driven by mouse Y)
  logoTiltRate:     6,   // easing rate toward the cursor target (higher = snappier)
  // Touch drag → yaw the logo (mobile only; see dragBegin/dragMove). A full
  // screen-width horizontal swipe turns it logoDragYawDeg, capped at logoDragMaxDeg so
  // it can never whip around. logoDragRate is the easing WHILE dragging and back to
  // rest on release — deliberately lower than logoTiltRate for a smooth, heavy feel.
  logoDragYawDeg: 150,
  logoDragMaxDeg: 75,
  logoDragRate:   3.5,

  // Neon outline (OutlinePass) — REMOVED in review round 2 ("poti sa te scapi de
  // acel outline portocaliu"). Strength 0 is the real off switch, not a dead knob:
  // animate() already skips the whole pass when edgeStrength rounds to 0, so this
  // also drops 2 full-scene re-renders + ~7 float16 fullscreen passes per frame —
  // by far the heaviest item in the chain on a phone. The pass is left wired into
  // the composer (and outlineColor/Glow/Thickness kept) so raising this restores it.
  // (outlineEnabled is vestigial — nothing reads it.)
  outlineEnabled:   false,
  outlineColor:     '#f95921',       // gradient top by default
  outlineStrength:  0,
  outlineGlow:      2,
  outlineThickness: 1.0,

  // Camera (fixed pose; scroll rotates the ring, not the camera)
  fov:               70,
  cameraDistance:    4,
  cameraHeight:      0.0,
  lookOffsetX:       0,
  lookOffsetY:       2,
  lookOffsetZ:       0,
  // Responsive framing: on viewports NARROWER than framingRefAspect (portrait /
  // tablet) the camera pulls back so the wide ring still fits; on landscape /
  // desktop (aspect ≥ ref) the base distance is kept. portraitFit scales how
  // aggressively it pulls back:
  //   1.0 = fully fit the whole ring (smallest, big empty bands top/bottom)
  //   0.0 = never pull back (biggest — desktop distance — crops the ring sides)
  // 0.35 keeps the composition large (center screen fills the phone, sides
  // cropped) and, as a side effect, drops the logo lower in frame at the end of
  // the scroll (a nearer camera makes the logo's world-space sink read bigger).
  // Raise → smaller / more of the ring fits. Lower → bigger / more crop.
  framingRefAspect:  1.6,
  portraitFit:       0.35,
  // Hide a video screen once its bounding sphere comes within this many world units of
  // the camera — it is sweeping through the camera and only shows as an edge-on slab
  // filling one side of the frame. See cullScreensNearCamera(). 0 disables.
  screenCameraClearance: 1.0,

  // Scene layout
  sceneZ:           -5,
  floorTargetY:     -1.4,
  floorRadius:      7,
  // Scales the logo about its base (logoYAdjust keeps it standing on the floor).
  // 1.12 per review — "putin mai mare".
  logoExtraScale:   1.12,
  // Extra world-space lift of the logo's RESTING height, on top of the layout's own
  // "stand it on the floor" placement. Review round 6: on mobile the logo's base was
  // slightly clipped by the floor / well rim during the intro. Desktop is fine, so
  // this stays 0 there and only the IS_MOBILE block raises it.
  logoLiftY:        0,

  // Floor "concrete" blackout — the view fades to black while the camera passes
  // down through the floor, then clears below it to reveal the logo. World Y,
  // relative to floorTargetY (the floor surface).
  blackoutEnabled:  true,
  blackoutFadeIn:   0.3,   // start darkening this far ABOVE the floor
  blackoutDepth:    0.5,   // stay fully black from the floor down to this depth
  blackoutFadeOut:  0.5,   // then fade back to clear over this further distance

  // Canvas transparency in the well: fade the renderer clear alpha 1→0 as the
  // camera sinks below the floor, so the DOM text + global background lines
  // behind the canvas show through while the opaque logo stays in front. Uses the
  // same depth band as the blackout fade-out (the blackout covers the switch).
  voidTransparency: true,

  // Floor occluder — an opaque dark ring just under the floor reflector. The
  // reflector is a single-sided plane, so from below its backface is culled and
  // you see the videos "through" it. This ring backs it. It's only shown while
  // the camera is BELOW the floor (see animate) — otherwise, with the camera
  // above and the logo dipping below, it would also cover the logo.
  // Solid floor "concrete" occluder (disabled — using the blackout fade instead).
  occluderEnabled:     false,
  occluderColor:       '#00000',
  occluderInnerRadius: 2.0,
  occluderDepth:       1.0,

  floorMeshVisible:    true,

  // Well — the central pit the logo dives into. (Disabled: only useful with the
  // camera-dive-into-well behavior, which we're not using.)
  wellEnabled:     false,
  wellColor:       '#000000',
  wellRadius:      2.0,   // the well opening (≈ reflectorInnerRadius)
  wellDepth:       6.0,   // how deep the walls go
  wellShowMargin:  0.6,   // walls appear once the camera is within this of the well radius

  // Scroll-driven ring rotation (camera is fixed). DESKTOP values; mobile gets
  // its own tour timing in the IS_MOBILE override block below.
  ringStartRotationDeg: 50,    // base rotation at scroll=0 so the initial view is framed/centered
  scrollMaxRotationDeg: 150,   // extra rotation added over the full scroll — small turn, not a full spin
  scrollFollowRate:     30,    // higher = ring tracks scroll faster (less lag). Raised 6->30:
                               // the page's Lenis already smooths scroll, so a low rate here
                               // double-smooths and the ring visibly trails the page. ~30 locks
                               // it to the page feel; lower = floatier, higher = tighter.

  // Hover mask on the video planes
  maskColor:       '#2e0000',
  maskBaseOpacity: 0.95,
  maskFadeRate:    16,
  // The mask shares the screen's exact geometry, so along the plane's silhouette the
  // two land on the same edge pixels. The screen is opaque and gets full MSAA
  // coverage there; the mask is transparent, so its alpha is scaled DOWN by the same
  // partial coverage — the bright video then shows through as a thin rim. Desktop
  // hides this because SMAA resolves the edge; mobile has SMAA off (see the perf
  // table), which is why the videos looked like they "spilled out of the mask on the
  // sides" there. Overscanning the mask a hair pushes its edge past the screen's so
  // it covers those pixels outright. Scaled about the plane's own centre, so it stays
  // aligned. 1 = exactly coincident (the old behaviour).
  maskOverscan:    1.0,
  maskBlur:        0.005,
  maskNoiseAmount: 0.12,   // 0 = none, 1 = full TV static
  maskNoiseSpeed:  60,     // higher = faster scrambling

  // Video → light color smoothing
  videoColorSmoothRate: 4,
  // 1.0 = mask fully replaces video light at 100% opacity (drowns video).
  // 0.0 = mask never affects the light (only the plane visual).
  // 0.7 = mask dominates but video color still bleeds through into the room.
  lightMaskInfluence: 1,

  // Ring light under the logo. Multiple SpotLights are distributed around
  // the ring circumference, all aimed at the logo, so the ring emits upward.
  ringEnabled:        true,
  ringIntensity:      1,
  ringDistance:       2.7,
  ringDecay:          2.15,
  ringLiftY:          0.7,
  ringAngleDeg:       70,    // cone half-angle
  ringPenumbra:       0.3,
  ringTargetOffsetY:  0.8,   // height above logoBase where the spot aims
};

// ─── Mobile-only tour/exit timing ───────────────────────────────────────────
// On portrait the ring reads differently and the camera is further back, so the
// screen tour needs its own framing + timing. DESKTOP keeps every value above
// untouched; only mobile gets these overrides.
if (IS_MOBILE) {
  // Screens are ~72° apart: screen 1 centered @ ring 0°, screen 2 @ 72°, screen
  // 3 @ 144.7°; screen 1 swings back into the camera at ring 148°. So center
  // screen 3 (@144.7) around scroll 0.45, then HARD-CLAMP the ring at 145° so it
  // never reaches 148° — even as the exit keeps advancing scroll — which would
  // pull the first screen through the camera.
  params.ringStartRotationDeg = 0;    // first screen centered at scroll 0
  params.scrollMaxRotationDeg = 322;  // screen 2 @ scroll 0.22, screen 3 @ scroll 0.45
  params.ringMaxRotationDeg   = 145;  // clamp: hold the tour on screen 3
  params.logoExitStart        = 0.5;  // delay the exit so all 3 screens are toured first
  params.logoExitEnd          = 0.68;
  // Descent: the portrait camera sits ~1.9× further back, so the same world-space
  // sink reads about half as deep on screen. Push the logo down further so the
  // camera still dives deep enough for the floor to leave the frame (pure black).
  // The logo's RESTING HEIGHT is no longer tuned here — params.logoRestNdcY fixes
  // it in screen space for every aspect, so this value only sets how deep the
  // journey through the empty space is.
  params.logoContinueDrop     = 14;   // was 7.5 — deeper sink for the further camera
  // Spin: the final orientation is (1 − logoExitEnd) × logoSpinDeg. With mobile's
  // logoExitEnd (0.68) that span is 0.32, so 2250° lands on exactly 720° (2 full
  // turns) → the logo settles facing forward, same as its start (like desktop).
  params.logoSpinDeg          = 2250;
  // Review round 6: the logo's base was slightly clipped by the floor / well rim
  // during the intro on portrait. Desktop frames it fine, so lift it only here.
  params.logoLiftY            = 0.16;
  // Review round 7: bigger logo on portrait, both at rest and once it has settled at
  // the bottom of the descent. logoExitMinScale is a FRACTION of the rest size, so it
  // has to be raised too or the larger rest size just shrinks back to the same pixels.
  // logoLiftY is nudged up with it, since a taller logo re-approaches the floor.
  params.logoExtraScale       = 1.32;
  params.logoExitMinScale     = 0.45;
  // Touch drag fully REPLACES the cursor tilt here — zero both cursor amounts so the
  // gesture is the only thing that turns the logo. This is not just tidiness: a single
  // tap still fires one pointermove, which would set ndcMouse and leave the logo stuck
  // at a static tilt with nothing to bring it back (there is no hover on touch).
  params.logoTiltYawDeg       = 0;
  params.logoTiltPitchDeg     = 0;
  // "smooth, deloc agresiv" — soften further than the default and shorten the throw.
  params.logoDragYawDeg       = 110;
  params.logoDragRate         = 2.6;
  // SMAA is desktop-only, so the mask's silhouette pixels are not resolved here and
  // the video fringes past the mask edge. Overscan the mask slightly to cover it.
  params.maskOverscan         = 1.012;
}

// Asset base URL. Locally (npm run dev / the standalone page) this is
// import.meta.env.BASE_URL so the GLB/videos resolve relative to the deployed
// page. When embedded in Webflow the relative path is wrong, so the host page
// sets `window.CC_ASSET_BASE` (e.g. a jsDelivr URL, CORS-enabled — required for
// the video color sampling) BEFORE loading this script, and we use that instead.
// Must end with a trailing slash.
const ASSET_BASE = (typeof window !== 'undefined' && window.CC_ASSET_BASE) || import.meta.env.BASE_URL;

// Mobile loads 360p variants (videos/mobile/) — the per-frame video-texture
// UPLOAD to the GPU is the mobile bottleneck (3 streams at once), and 360p is
// ~4× less pixel data than the 720p desktop files while still being sharp on a
// phone-sized screen. Desktop keeps the full-resolution files.
const VIDEO_DIR = IS_MOBILE ? 'videos/mobile/' : 'videos/';
const TEST_VIDEOS = [
  `${ASSET_BASE}${VIDEO_DIR}Space.mp4`,
  `${ASSET_BASE}${VIDEO_DIR}Roblox.mp4`,
  `${ASSET_BASE}${VIDEO_DIR}Mrbeast-Ig.mp4`,
];

// ─── Video pre-load — starts NOW, in parallel with the GLB ───────────────────
// The <video> elements are created and their fetches kicked off here at module
// scope. They used to be created inside the GLB's onLoad callback, which
// SERIALISED every byte of video behind the whole model chain: the external
// gstatic Draco-decoder round-trip, the GLB download, the Draco decode, then the
// scene build. Nothing about a video fetch depends on the model, so both streams
// now run at once and the videos are typically decoding their first frame by the
// time the meshes exist. The mesh/texture wiring still happens after the GLB
// (attachVideo below) because cover-fit needs userData.screenAspect from it.
function startVideo(index, url) {
  const video = document.createElement('video');
  // crossOrigin must be set BEFORE src so the canvas isn't tainted later.
  video.crossOrigin = 'anonymous';
  video.muted       = true;
  video.loop        = true;
  video.playsInline = true;
  video.autoplay    = true;
  video.preload     = 'auto';

  const label = `[plane ${index} ← ${url}]`;
  const ready = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    video.addEventListener('loadeddata', () => {
      // Start playback the moment data is available — independent of the GLB — so
      // frames are already flowing when the texture gets attached (no frozen
      // first frame on reveal).
      video.play().catch((e) => console.warn(`${label} play() rejected:`, e));
      finish(true);
    });
    video.addEventListener('error', () => {
      const err = video.error;
      console.warn(
        `${label} FAILED — code ${err?.code} (${err?.message || 'unknown'}). ` +
        `Most likely the browser can't decode this codec. Convert to .mp4 (H.264).`
      );
      finish(false);
    });
    video.addEventListener('stalled', () => console.warn(`${label} stalled`));
  });

  video.src = url;   // set LAST — the fetch starts with all handlers already attached
  return { video, ready };
}

const videoLoads = TEST_VIDEOS.map((url, i) => startVideo(i, url));

// Measurements pulled from the GLB after it loads.
const layout = {
  ready:                false,
  measuredFloorRadius:  0,
  floorCenter:          new THREE.Vector3(),
  logoBboxMinY:         0,
  floorBboxMaxY:        0,
  floorMeshes:          [],           // ring-1 / Circle*: shell pieces, sorted lowest Y first
  videoMeshes:          [],           // ring-2..6 / Screen_*, in numeric / name order
  logoMeshes:           [],           // ring-7 / Curve
  ceilingBboxMinY:      null,         // baked Y of the underside of the upper shell piece
};


// ─── Logo material (matte gradient metal, lit by the scene) ─────────────────
// Was a transmissive MeshPhysicalMaterial ("glass/ice"). Per review the logo is
// now the brand linear gradient on a MATTE surface so the ring spotlight and the
// per-screen video RectAreaLights show up as soft moving reflections on it.
//
// Why MeshStandardMaterial + a shader patch rather than glass or a texture:
//  • Standard, not Physical: nothing here needs transmission/clearcoat/sheen, and
//    dropping transmission also drops three's separate transmission render pass +
//    framebuffer copy — one of the mobile costs flagged in CLAUDE.md. RectAreaLight
//    is supported by Standard, which is what makes the screens visible on the logo.
//  • A patch, not a gradient texture: the GLB's logo UVs are not vertically
//    aligned, so a texture would smear. Driving the gradient off LOCAL position.y
//    is also exactly the mapping the exit shell (gradientMaterial) uses, so the
//    two stay in perfect register through the crossfade.
// The gradient feeds BOTH the diffuse/specular colour and an emissive floor
// (uSelfLit), because the scene has no ambient light at all — without it the logo
// would be black wherever no spot/screen light lands.
const logoGradientUniforms = {
  uTop:     { value: new THREE.Color(params.logoGradientTop) },
  uBottom:  { value: new THREE.Color(params.logoGradientBottom) },
  uMinY:    { value: 0 },   // filled in from the logo bbox once the GLB loads
  uMaxY:    { value: 1 },
  uBias:    { value: params.logoGradientBias },
  uSelfLit: { value: params.logoSelfLit },
};

const logoMaterial = new THREE.MeshStandardMaterial({
  color:       0xffffff,   // the gradient multiplies into this
  metalness:   params.logoMetalness,
  roughness:   params.logoRoughness,
  side:        THREE.DoubleSide,
  transparent: true,       // the intro fades opacity 0→1, the exit fades it back out
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

// ─── Logo exit gradient material (unlit vertical gradient) ──────────────────
// On its way out the logo dives into the unlit well below the ring, where the
// transmissive glass would go invisible. Swap to this self-lit gradient so it
// stays clearly readable as it leaves. uMinY/uMaxY are set to the logo's local
// Y bounds once the GLB loads.
// It renders as a thin "shell" coincident with the glass logo (polygonOffset +
// depthWrite:false keep it just in front without z-fighting). uOpacity crossfades
// it in smoothly over the glass as the logo exits — no hard material swap.
const gradientMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTop:     { value: new THREE.Color(params.logoGradientTop) },
    uBottom:  { value: new THREE.Color(params.logoGradientBottom) },
    uMinY:    { value: 0 },
    uMaxY:    { value: 1 },
    uBias:    { value: params.logoGradientBias },
    uOpacity: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying float vY;
    void main() {
      vY = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      // The shell is coincident with the lit logo mesh (same geometry), so bias ONLY
      // the clip-space depth toward the near plane — leave x/y/w alone so it stays
      // pixel-aligned with the logo. Angle-independent because the geometry is
      // coincident, unlike polygonOffset. This is what lets depthTest/depthWrite stay
      // ON (so the floor occludes it and its own faces resolve) without z-fighting
      // against the logo underneath it.
      gl_Position.z -= 0.0015 * gl_Position.w;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uTop;
    uniform vec3 uBottom;
    uniform float uMinY;
    uniform float uMaxY;
    uniform float uBias;
    uniform float uOpacity;
    varying float vY;
    void main() {
      // Same ramp + bias as the lit logo material, so the crossfade shows no shift.
      float t = clamp((vY - uMinY) / max(uMaxY - uMinY, 1e-4), 0.0, 1.0);
      gl_FragColor = vec4(mix(uBottom, uTop, pow(t, uBias)), uOpacity);
    }
  `,
  side:          THREE.DoubleSide,
  transparent:   true,   // needed for the uOpacity crossfade
  // Depth is ON for both test and write (review round 3 fixed this). It used to run
  // with depthTest AND depthWrite off, on the assumption that "the shell is only
  // visible once the logo is alone in the empty well with nothing in front of it".
  // That assumption was wrong and caused two reported bugs at once:
  //   • depthTest:false → the shell drew straight THROUGH the floor, so the logo was
  //     visible over the "fantana" well instead of disappearing behind its near wall.
  //   • depthWrite:false → with DoubleSide and no depth resolution, all of the
  //     shell's own triangles simply blended in geometry order, so the last-drawn
  //     BACK face won. Once the logo span around far enough to show its edges it
  //     looked see-through — you were seeing its own far side.
  // The original reason for turning depth off was real: the shell shares the logo
  // mesh's exact geometry, so at grazing angles polygonOffset can't reliably keep
  // the coincident surfaces apart and they z-fight. The fix is the same clip-space
  // depth bias the hover mask already uses (see the vertex shader above) — biasing
  // only gl_Position.z is angle-independent for coincident geometry.
  depthWrite:    true,
  depthTest:     true,
});

// ─── Well ("fantana") metal: tiny synthetic environment + material ──────────
// A MeshStandardMaterial at metalness 1 has NO diffuse term, so with no envMap it
// reflects nothing and renders black. This builds a 64×32 equirectangular gradient
// in the room's palette and runs it through PMREMGenerator once, which gives the
// correctly pre-blurred mip chain roughness needs. One-off cost, then disposed.
let wellEnvMap = null;
function buildWellEnv() {
  if (wellEnvMap) return wellEnvMap;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  // Equirect: v=0 is UP. Top of the image = ceiling, bottom = floor.
  g.addColorStop(0, params.wellEnvTop);
  g.addColorStop(Math.min(0.99, Math.max(0.01, params.wellEnvHorizon)), params.wellEnvMid);
  g.addColorStop(1, params.wellEnvBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping    = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  wellEnvMap = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return wellEnvMap;
}

function makeWellMaterial() {
  // Guard the one setting that silently defeats the whole material. A near-black
  // albedo tints both the diffuse and the metallic reflection to nothing, so the well
  // renders black and stops responding to the video lights entirely — which reads as
  // "the metal isn't working" rather than as a colour choice.
  const albedo = new THREE.Color(params.wellSurfaceColor);
  if (Math.max(albedo.r, albedo.g, albedo.b) < 0.02) {
    console.warn(
      `wellSurfaceColor is ${params.wellSurfaceColor} (near-black): at metalness `
      + `${params.wellSurfaceMetalness} the well will render black and will NOT react `
      + 'to the video lights on hover. Use a warm neutral and tint via wellEnv* instead.'
    );
  }
  const mat = new THREE.MeshStandardMaterial({
    color:            new THREE.Color(params.wellSurfaceColor),
    metalness:        params.wellSurfaceMetalness,
    roughness:        params.wellSurfaceRoughness,
    envMap:           buildWellEnv(),
    envMapIntensity:  params.wellSurfaceEnvIntensity,
    side:             THREE.DoubleSide,
  });
  // Same reason as the floor: the per-screen RectAreaLights would otherwise paint a
  // hard bright rectangle each onto the well walls (review round 4). Polished metal
  // makes that WORSE than on the floor, not better.
  mat.onBeforeCompile = dropRectAreaSpecular;
  return mat;
}

// ─── Floor / ceiling: RectAreaLight DIFFUSE only ────────────────────────────
// Each screen drives a RectAreaLight sized to the screen. On a glossy or metallic
// floor, three's LTC area-light SPECULAR term draws a mirror image of the light's
// RECTANGLE — a hard-edged bright quad, one per screen. That is the "dreptunghi
// alb / placeholder alb" from review round 4. It was always there; it only became
// visible once the planar mirror went transparent (round 3) and stopped covering
// the floor mesh. It is at its worst with floorMetalness near 1, because a metal
// has no diffuse term at all, so the quads are ALL you see.
//
// It is also simply wrong here, not just ugly: the planar Reflector already puts
// the TRUE mirror image of the screens on the floor. The area light's specular lobe
// is a second, fake, hard-edged copy of the same screens, at the light's rectangle
// rather than at the screen's real reflected position.
//
// So: keep the area lights' DIFFUSE contribution (that is the coloured spill from
// the videos, the whole point of them) and drop their SPECULAR. Done by overriding
// three's RE_Direct_RectArea macro rather than by detuning metalness/roughness, so
// those two stay free to tune the floor's look without the quads coming back.
// Only the floor/ceiling get this — the LOGO deliberately keeps area-light specular,
// since "see the video lights reflected on the logo" was the round-1 request.
function dropRectAreaSpecular(shader) {
  const NEEDLE = '#include <lights_physical_pars_fragment>';
  if (!shader.fragmentShader.includes(NEEDLE)) {
    // Fail loudly rather than silently leaving the quads in.
    console.error('dropRectAreaSpecular: shader chunk not found — white light quads will show on the floor/ceiling');
    return;
  }
  shader.fragmentShader = shader.fragmentShader.replace(NEEDLE, /* glsl */`${NEEDLE}
    void RE_Direct_RectArea_DiffuseOnly(
      const in RectAreaLight rectAreaLight, const in vec3 geometryPosition,
      const in vec3 geometryNormal, const in vec3 geometryViewDir,
      const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
      inout ReflectedLight reflectedLight
    ) {
      ReflectedLight tmp = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
      RE_Direct_RectArea_Physical(
        rectAreaLight, geometryPosition, geometryNormal, geometryViewDir,
        geometryClearcoatNormal, material, tmp
      );
      reflectedLight.directDiffuse += tmp.directDiffuse;  // keep the coloured spill
      // tmp.directSpecular is discarded — that was the mirrored light QUAD.
    }
    #undef RE_Direct_RectArea
    #define RE_Direct_RectArea RE_Direct_RectArea_DiffuseOnly
  `);
}

// ─── Mask shader (frosted-glass blur of the video behind, plus red tint) ────
function makeMaskMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uVideo:        { value: null },
      uMaskColor:    { value: new THREE.Color(params.maskColor) },
      uOpacity:      { value: params.maskBaseOpacity },
      uBlur:         { value: params.maskBlur },
      uNoiseAmount:  { value: params.maskNoiseAmount },
      uTime:         { value: 0 },
      // Cover-fit transform (matches the screen material's texture repeat/offset)
      // so the blurred mask crops the video the same way the screen does.
      uUvScale:      { value: new THREE.Vector2(1, 1) },
      uUvOffset:     { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // The mask shares the screen's exact (curved) geometry, so at grazing
        // angles polygonOffset alone can't keep it in front → z-fighting glitches
        // as the ring rotates. Bias ONLY the clip-space depth toward the near
        // plane (leave x/y/w untouched) so the mask stays pixel-aligned with the
        // screen — no lateral shift, no exposed video edge — while sitting just
        // in front of it. Angle-independent because the geometry is coincident.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z -= 0.001 * gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uVideo;
      uniform vec3 uMaskColor;
      uniform float uOpacity;
      uniform float uBlur;
      uniform float uNoiseAmount;
      uniform float uTime;
      uniform vec2 uUvScale;
      uniform vec2 uUvOffset;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        // Cover-fit the video the same way the screen material does.
        vec2 cuv = vUv * uUvScale + uUvOffset;
        float r = uBlur * uOpacity;
        vec3 sum = vec3(0.0);
        for (int x = -${MASK_KERNEL_R}; x <= ${MASK_KERNEL_R}; x++) {
          for (int y = -${MASK_KERNEL_R}; y <= ${MASK_KERNEL_R}; y++) {
            vec2 off = vec2(float(x), float(y)) * r;
            sum += texture2D(uVideo, cuv + off).rgb;
          }
        }
        vec3 bg = sum / ${MASK_KERNEL_TAPS}.0;
        vec3 finalColor = mix(bg, uMaskColor, uOpacity);
        // Dark-red noise grain that fades with the mask.
        float n = hash(vUv * 720.0 + uTime);
        finalColor = mix(finalColor, uMaskColor * n, uNoiseAmount * uOpacity);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side:          THREE.DoubleSide,
    // Coincident with the video plane — render just in front of it, no z-fight.
    polygonOffset:       true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits:  -1,
  });
}

// ─── Groups ──────────────────────────────────────────────────────────────────
const logoGroup   = new THREE.Group();
const floorGroup  = new THREE.Group();
const videosGroup = new THREE.Group();
// videosPivot sits at the ring center (world x=0, z=sceneZ) and is the thing we
// rotate on scroll — so the screens orbit around their true center while the
// logo and floor stay put. videosGroup is offset inside it to keep the baked
// GLB geometry aligned.
const videosPivot = new THREE.Group();
const ringGroup   = new THREE.Group();
const logoBase    = new THREE.Vector3();
const floorBase   = new THREE.Vector3();
videosPivot.add(videosGroup);
scene.add(logoGroup, floorGroup, videosPivot, ringGroup);

// "Legendary drop" SpotLight: one cone shining UP from the floor center at
// the logo. Replaces the previous torus + ring of spotlights.
let logoSpot       = null;
let logoSpotTarget = null;
const DEG_TO_RAD = Math.PI / 180;

function rebuildRingLight() {
  if (logoSpot) {
    ringGroup.remove(logoSpot);
    logoSpot = null;
  }
  if (logoSpotTarget) {
    scene.remove(logoSpotTarget);
    logoSpotTarget = null;
  }
  if (!params.ringEnabled) return;

  logoSpotTarget = new THREE.Object3D();
  scene.add(logoSpotTarget);

  logoSpot = new THREE.SpotLight(
    params.gradientBottom,
    params.ringIntensity,
    params.ringDistance,
    params.ringAngleDeg * DEG_TO_RAD,
    params.ringPenumbra,
    params.ringDecay,
  );
  logoSpot.position.set(0, 0, 0);     // local to ringGroup (floor center)
  logoSpot.target = logoSpotTarget;
  ringGroup.add(logoSpot);
}

function updateRingLightPosition() {
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
}

function applyRingColor() {
  if (logoSpot) logoSpot.color.set(params.gradientBottom);
}

// ─── Planar reflectors (floor + roof) ───────────────────────────────────────
// makeBlurredReflector returns a THREE.Reflector with its FRAGMENT shader patched
// to blur the reflection: a binomial-weighted (1,4,6,4,1)² 5×5 kernel sampled in
// TEXELS, replacing the original box kernel at a fixed raw-UV step (~5 screen px
// per tap, coarse enough to under-sample the moving video — that undersampling was
// itself the shimmer). Everything after the blur is three's stock overlay blend,
// untouched, so the reflection's own brightness and hue are exactly as they were.
// Intensity is then dialled by making the mesh genuinely TRANSPARENT (opts.opacity)
// so the real floor/ceiling material blends through — never by mixing toward the
// flat tint, which is what made the surfaces read too bright in round 1. See the
// reflector params block.
function makeBlurredReflector(geom, opts) {
  // Reflectors render the whole scene to a texture every frame — the biggest perf
  // hit. Sub-resolution is invisible once blur is in the chain, and here it is
  // actively wanted (see REFLECTOR_RT_SCALE).
  const rtW = Math.max(1, Math.floor(viewportW() * REFLECTOR_RT_SCALE));
  const rtH = Math.max(1, Math.floor(viewportH() * REFLECTOR_RT_SCALE));
  const r = new Reflector(geom, {
    clipBias:      0.003,
    textureWidth:  rtW,
    textureHeight: rtH,
    color:         new THREE.Color(opts.tint),
  });
  const u = r.material.uniforms;
  u.uBlur    = { value: opts.blur };
  u.uTexel   = { value: new THREE.Vector2(1 / rtW, 1 / rtH) };
  u.uOpacity = { value: opts.opacity };

  // Blend the mirror OVER the real floor/ceiling mesh (which is opaque, so it is
  // already in the framebuffer by the time this transparent pass runs) rather than
  // replacing it. depthWrite off because this is a coplanar overlay sitting
  // reflectorLift above the surface — it must not occlude the logo descending
  // through the well below it.
  r.material.transparent = true;
  r.material.depthWrite  = false;

  // The vertex shader is left STOCK — the blur needs nothing from it.
  r.material.fragmentShader = /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uBlur;
    uniform vec2 uTexel;
    uniform float uOpacity;
    varying vec4 vUv;
    #include <logdepthbuf_pars_fragment>
    float blendOverlay(float base, float blend) {
      return (base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend)));
    }
    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
    }
    // Binomial 1,4,6,4,1 — a cheap separable Gaussian approximation. Written as a
    // function rather than a const array because this material compiles as GLSL1
    // (three's default for ShaderMaterial), where array constructors don't exist.
    float kernelWeight(int i) {
      if (i == -2 || i == 2) return 1.0;
      if (i == -1 || i == 1) return 4.0;
      return 6.0;
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec2 baseUv = vUv.xy / vUv.w;
      vec3 sum = vec3(0.0);
      float wSum = 0.0;
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          float w = kernelWeight(x) * kernelWeight(y);
          vec2 off = vec2(float(x), float(y)) * uBlur * uTexel;
          sum += texture2D(tDiffuse, baseUv + off).rgb * w;
          wSum += w;
        }
      }
      // Weighted mean → average brightness is preserved exactly, so blurring
      // cannot brighten or darken the reflection. Then three's stock overlay blend,
      // unmodified. uOpacity is the ALPHA, so the reflection is composited over the
      // real floor/ceiling material instead of replacing it — the surface keeps its
      // own colour and stops reading as a mirror.
      gl_FragColor = vec4(blendOverlay(sum / wSum, color), uOpacity);
    }
  `;
  r.material.needsUpdate = true;

  // Half-rate the re-render: rendering the whole scene into the mirror RT is the
  // reflector's real cost, so refresh it only every REFLECTION_EVERY-th frame and
  // reuse the last texture in between (the mirror is never hidden and the RT is
  // never cleared — it just keeps displaying its previous contents). Applies to
  // BOTH mirrors, desktop + mobile.
  //
  // The gate reads the shared per-frame `reflectorFrame` counter (advanced once
  // per rendered frame in animate) rather than a per-CALL counter: with two
  // reflectors, each onBeforeRender fires several times per frame (each mirror
  // re-renders the scene the OTHER mirror appears in, via nested renders), so a
  // per-call counter would desync. A per-reflector `initialized` guard forces the
  // very first onBeforeRender to render regardless of the counter's parity when
  // the reflector is built — so the RT is always populated before it is ever
  // displayed (no first-frame flicker / uninitialised-texture artifact).
  const origOnBeforeRender = r.onBeforeRender;
  let initialized = false;
  r.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    // Skip during OutlinePass override passes (depth/mask): that pass re-renders
    // the scene with an override material INTO the reflection RT as the frame's
    // LAST write, so a skipped half-rate frame would then reuse depth garbage → a
    // 30Hz strobe. Only the real color RenderPass (no overrideMaterial) may write
    // the reflection RT. (Bonus: also drops a wasted per-frame depth re-render.)
    if (scene.overrideMaterial) return;
    if (!initialized || (reflectorFrame % REFLECTION_EVERY) === 0) {
      initialized = true;
      origOnBeforeRender.call(this, renderer, scene, camera, geometry, material, group);
    }
  };

  return r;
}

let floorReflector = null;
let roofReflector  = null;
// Advanced once per rendered frame in animate(); read by every reflector's gated
// onBeforeRender (see makeBlurredReflector) to decide whether to refresh its RT
// this frame or reuse last frame's texture. Shared so both mirrors stay in phase.
let reflectorFrame = 0;

function rebuildFloorReflector() {
  if (floorReflector) {
    if (floorReflector.parent) floorReflector.parent.remove(floorReflector);
    floorReflector.geometry.dispose();
    if (floorReflector.material) floorReflector.material.dispose();
    floorReflector = null;
  }
  if (!params.reflectorEnabled) return;

  // Geometry = the floor's OWN flat top faces (splitFloorGeometry), so the mirror
  // takes the floor's exact shape and the groove + well opening stay visible as real
  // geometry instead of being covered by a flat plate (review round 5). Falls back to
  // the old flat ring only if the split found nothing, so a re-exported GLB without a
  // clean flat level still renders something rather than losing the mirror silently.
  let geom = layout.floorTopGeometry;
  let planeWorldY = 0;
  if (!geom) {
    console.warn('floor reflector: no flat top surface found — falling back to a flat ring');
    const outer = params.floorRadius;
    const inner = Math.min(2.0, outer * 0.28);
    if (outer <= inner) return;
    geom = new THREE.RingGeometry(inner, outer, 96);
    planeWorldY = params.floorTargetY;
  } else {
    // Bake the FLOOR'S OWN world transform into the geometry so the reflector needs
    // no parent transform at all — it is a plain scene child in world units, exactly
    // like the flat ring it replaces. (Parenting it under the scaled floorGroup
    // instead also places it correctly, but leaves Reflector's plane maths dependent
    // on a scaled parent, which is a needless variable in something this fiddly.)
    floorGroup.updateMatrixWorld(true);
    geom = geom.clone().applyMatrix4(floorGroup.matrixWorld);
    geom.computeBoundingBox();
    // The extracted faces all lie on ONE horizontal plane — that is the whole point
    // of picking only the modal level — so its world height is just the box's Y.
    planeWorldY = geom.boundingBox.max.y;
    // CRITICAL: Reflector reads a point on the mirror plane from the object's world
    // POSITION (`setFromMatrixPosition(scope.matrixWorld)`), NOT from its geometry.
    // So the plane has to pass through the object's origin; a centred RingGeometry
    // satisfied that for free. Move it there, and put the height back on the object.
    geom.translate(0, -planeWorldY, 0);
    // Reflector also assumes the plane normal is LOCAL +Z, but these faces are
    // horizontal (+Y). Pre-rotate the geometry +90° about X so its normal becomes +Z;
    // the object's -90° below cancels it, so the faces land exactly where they were.
    geom.rotateX(Math.PI / 2);
  }
  layout.floorReflectorPlaneY = planeWorldY;

  floorReflector = makeBlurredReflector(geom, {
    tint:    params.reflectorTint,
    blur:    params.reflectorBlur,
    opacity: params.reflectorOpacity,
  });
  floorReflector.rotation.x = -Math.PI / 2;

  scene.add(floorReflector);
  positionFloorReflector();

}

function rebuildRoofReflector() {
  if (roofReflector) {
    scene.remove(roofReflector);
    roofReflector.geometry.dispose();
    if (roofReflector.material) roofReflector.material.dispose();
    roofReflector = null;
  }
  if (!params.roofReflectorEnabled || layout.ceilingBboxMinY === null) return;
  const inner = params.roofReflectorInnerRadius;
  const outer = params.floorRadius;
  if (outer <= inner) return;
  const geom = inner > 0
    ? new THREE.RingGeometry(inner, outer, 96)
    : new THREE.CircleGeometry(outer, 96);
  roofReflector = makeBlurredReflector(geom, {
    tint:    params.roofReflectorTint,
    blur:    params.roofReflectorBlur,
    opacity: params.roofReflectorOpacity,
  });
  // Face DOWN so it reflects everything below the ceiling.
  roofReflector.rotation.x = Math.PI / 2;
  scene.add(roofReflector);
  positionRoofReflector();
}

function positionFloorReflector() {
  if (!floorReflector) return;
  // World space in both paths. The extracted-geometry path already carries the floor's
  // exact XZ inside its vertices (floorGroup's transform is baked in), so X/Z stay 0
  // there; only the flat-ring fallback needs centring on floorBase. Y restores the
  // mirror plane's world height — rebuildFloorReflector moved the geometry onto the
  // local origin because Reflector reads the plane point from the object's position.
  const onFloorGeometry = !!layout.floorTopGeometry;
  floorReflector.position.set(
    onFloorGeometry ? 0 : floorBase.x,
    (layout.floorReflectorPlaneY ?? params.floorTargetY) + params.reflectorLift,
    onFloorGeometry ? 0 : floorBase.z,
  );
}

function positionRoofReflector() {
  if (!roofReflector || layout.ceilingBboxMinY === null) return;
  const glbScale = params.floorRadius / layout.measuredFloorRadius;
  const ceilingY = floorBase.y + layout.ceilingBboxMinY * glbScale;
  roofReflector.position.set(
    floorBase.x,
    ceilingY - params.roofReflectorLift,
    floorBase.z,
  );
}

// ─── Floor occluder (opaque dark ring just under the floor) ─────────────────
// The floor is a thin shell — from below/at grazing angle you can see the
// videos "through" it. This ring sits just under the floor and blocks that
// view. Its inner hole is kept larger than the camera's distance from centre,
// so the camera and the exiting logo pass through the open middle and the logo
// stays visible while the videos beyond get occluded. On LAYER_MAIN_ONLY so it
// never shows up inside the floor/ceiling mirror reflections.
let floorOccluder = null;
function rebuildFloorOccluder() {
  if (floorOccluder) {
    scene.remove(floorOccluder);
    floorOccluder.geometry.dispose();
    floorOccluder.material.dispose();
    floorOccluder = null;
  }
  if (!params.occluderEnabled) return;
  const inner = params.occluderInnerRadius;
  const outer = params.floorRadius;
  if (outer <= inner) return;
  const depth = params.occluderDepth;
  // A solid annular "washer" (top face + outer wall + bottom face + inner wall),
  // lathed around Y. Unlike a flat ring it also blocks grazing views through the
  // floor's hollow side. The central hole (inner radius) stays open for the well
  // so the logo diving through it stays visible.
  const profile = [
    new THREE.Vector2(inner, 0),
    new THREE.Vector2(outer, 0),
    new THREE.Vector2(outer, -depth),
    new THREE.Vector2(inner, -depth),
    new THREE.Vector2(inner, 0),
  ];
  const geom = new THREE.LatheGeometry(profile, 96);
  const mat  = new THREE.MeshBasicMaterial({
    color: new THREE.Color(params.occluderColor),
    side:  THREE.DoubleSide,
  });
  floorOccluder = new THREE.Mesh(geom, mat);
  floorOccluder.layers.set(LAYER_MAIN_ONLY);
  scene.add(floorOccluder);
  positionFloorOccluder();
}

function positionFloorOccluder() {
  if (!floorOccluder) return;
  // Top face just under the floor surface (so the floor hides it from above);
  // the washer then extends downward by occluderDepth.
  floorOccluder.position.set(floorBase.x, params.floorTargetY - 0.01, floorBase.z);
}

// ─── Well walls (the pit the logo/camera dive into) ─────────────────────────
// A dark opaque tube (wall + bottom) at the well radius. Shown only once the
// camera has dived inside, where it hides the surrounding screens/floor. On
// LAYER_MAIN_ONLY so it never appears in the mirror reflections.
let wellWall = null;
function rebuildWell() {
  if (wellWall) {
    scene.remove(wellWall);
    wellWall.geometry.dispose();
    wellWall.material.dispose();
    wellWall = null;
  }
  if (!params.wellEnabled) return;
  const r = params.wellRadius;
  const profile = [
    new THREE.Vector2(r,     0),
    new THREE.Vector2(r,     -params.wellDepth),
    new THREE.Vector2(0.001, -params.wellDepth),
  ];
  const geom = new THREE.LatheGeometry(profile, 64);
  const mat  = new THREE.MeshBasicMaterial({
    color: new THREE.Color(params.wellColor),
    side:  THREE.DoubleSide,
  });
  wellWall = new THREE.Mesh(geom, mat);
  wellWall.layers.set(LAYER_MAIN_ONLY);
  wellWall.visible = false;
  scene.add(wellWall);
  positionWell();
}

function positionWell() {
  if (!wellWall) return;
  wellWall.position.set(floorBase.x, params.floorTargetY, floorBase.z);
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
    // recomposition. Its WORLD matrix still updates when a moving parent forces it
    // (logo meshes ride the animated logoGroup; screen meshes ride the rotating
    // videosPivot), so nothing visual changes. Static floor/ceiling meshes simply
    // stay put. Zero visual change.
    mesh.matrixAutoUpdate = false;
    if (material) mesh.material = material;
    group.add(mesh);
    geom.computeBoundingBox();
    bbox.union(geom.boundingBox);
  }
  return bbox;
}

// ─── Floor geometry split: flat top surface / well / the rest ───────────────
// The floor (`Circle`) is ONE 13350-triangle mesh that contains the flat disc, a
// narrow recessed groove, and the central "fantana" well. Two things need slices
// of it, so both are cut here in one pass over the baked geometry:
//
//   topSurface — every upward-facing triangle sitting on the floor's MAIN level.
//                Used as the planar reflector's geometry (review round 5): the old
//                reflector was a flat RingGeometry plate laid over the floor, which
//                covered the groove and flattened the floor's real outline. Using
//                the floor's own top faces means the mirror IS the floor's top
//                surface — the groove and the well opening stay as real geometry
//                because they are simply not part of it.
//                It is also strictly MORE correct: three's Reflector mirrors the
//                camera about ONE plane, and every triangle kept here lies on that
//                single plane, so the reflection is exact everywhere it is drawn.
//   well       — the triangles inside the top surface's inner hole, i.e. the
//                fantana. Split out so it can take its own metal material.
//
// Everything is measured from the geometry rather than hardcoded: the main level is
// the area-weighted modal Y of the upward faces, and the well is bounded by the
// radius of the hole in that surface. So it survives the GLB being re-exported.
function splitFloorGeometry(geom, centerXZ) {
  const pos = geom.attributes.position;
  const idx = geom.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const radius = (v) => Math.hypot(v.x - centerXZ.x, v.z - centerXZ.z);

  // Pass 1: area-weighted histogram of upward-face Y → the main floor level.
  const areaByY = new Map();
  const tri = [];
  for (let t = 0; t < triCount; t++) {
    A.fromBufferAttribute(pos, vi(t, 0));
    B.fromBufferAttribute(pos, vi(t, 1));
    C.fromBufferAttribute(pos, vi(t, 2));
    ab.subVectors(B, A); ac.subVectors(C, A); nrm.crossVectors(ab, ac);
    const area = nrm.length() / 2;
    if (area < 1e-12) { tri.push(null); continue; }
    nrm.normalize();
    const rec = {
      up: nrm.y > 0.9,
      y: (A.y + B.y + C.y) / 3,
      rMin: Math.min(radius(A), radius(B), radius(C)),
      rMax: Math.max(radius(A), radius(B), radius(C)),
      area,
    };
    tri.push(rec);
    if (rec.up) {
      const k = rec.y.toFixed(3);
      areaByY.set(k, (areaByY.get(k) || 0) + area);
    }
  }
  let topY = 0, bestArea = -1;
  for (const [k, a] of areaByY) if (a > bestArea) { bestArea = a; topY = parseFloat(k); }

  // Pass 2: classify. EPS_Y is generous enough to absorb float noise on the main
  // level but far tighter than the groove depth, so groove bottoms stay excluded.
  const EPS_Y = 1e-3;
  const isTop = (r) => r && r.up && Math.abs(r.y - topY) < EPS_Y;
  let holeR = Infinity;
  for (const r of tri) if (isTop(r)) holeR = Math.min(holeR, r.rMin);
  if (!isFinite(holeR)) holeR = 0;
  // Anything strictly inside the hole is the well. The margin keeps the hole's own
  // boundary ring out of the well slice.
  const wellR = holeR * 1.02;

  const topIdx = [], wellIdx = [], restIdx = [];
  for (let t = 0; t < triCount; t++) {
    const r = tri[t];
    if (!r) { restIdx.push(t); continue; }
    if (isTop(r)) topIdx.push(t);
    else if (r.rMax <= wellR) wellIdx.push(t);
    else restIdx.push(t);
  }

  // Non-indexed extraction — simplest and these are one-off static buffers.
  const extract = (list) => {
    const out = new THREE.BufferGeometry();
    const n = list.length * 3;
    const p = new Float32Array(n * 3);
    const hasN = !!geom.attributes.normal;
    const nn = hasN ? new Float32Array(n * 3) : null;
    let w = 0;
    for (const t of list) {
      for (let k = 0; k < 3; k++) {
        const s = vi(t, k);
        p[w * 3] = pos.getX(s); p[w * 3 + 1] = pos.getY(s); p[w * 3 + 2] = pos.getZ(s);
        if (hasN) {
          const na = geom.attributes.normal;
          nn[w * 3] = na.getX(s); nn[w * 3 + 1] = na.getY(s); nn[w * 3 + 2] = na.getZ(s);
        }
        w++;
      }
    }
    out.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (hasN) out.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    out.computeBoundingBox();
    return out;
  };

  return {
    topY,
    holeR,
    topSurface: topIdx.length ? extract(topIdx) : null,
    well:       wellIdx.length ? extract(wellIdx) : null,
    // The floor keeps its top surface (the reflector only blends OVER it) — the
    // well is the sole slice removed, so it can be shaded as metal.
    floorRest:  wellIdx.length ? extract(topIdx.concat(restIdx)) : null,
    counts: { top: topIdx.length, well: wellIdx.length, rest: restIdx.length },
  };
}

// Build a single RectAreaLight that matches each screen's actual width/height
// along its local axes (not its arbitrarily-oriented bbox), oriented to the
// mesh's average normal so it emits inward toward the camera.
function buildSlicedVideoLights(m, sceneCenter) {
  if (m.userData.videoLight) {
    const old = m.userData.videoLight;
    if (old.parent) old.parent.remove(old);
  }

  const pos  = m.geometry.attributes.position;
  const norm = m.geometry.attributes.normal;
  if (!pos || !norm) return;

  const up = new THREE.Vector3(0, 1, 0);

  const avgN = new THREE.Vector3();
  for (let i = 0; i < norm.count; i++) {
    avgN.x += norm.getX(i);
    avgN.y += norm.getY(i);
    avgN.z += norm.getZ(i);
  }
  if (avgN.lengthSq() > 0) avgN.normalize();
  const center = new THREE.Vector3();
  m.geometry.boundingBox.getCenter(center);
  const toCenter = new THREE.Vector3().subVectors(sceneCenter, center);
  if (avgN.dot(toCenter) < 0) avgN.negate();

  let widthAxis = new THREE.Vector3().crossVectors(avgN, up);
  if (widthAxis.lengthSq() < 1e-6) widthAxis.set(1, 0, 0);
  widthAxis.normalize();
  const heightAxis = new THREE.Vector3().crossVectors(widthAxis, avgN).normalize();

  let wMin = Infinity, wMax = -Infinity, hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const wP = x * widthAxis.x  + y * widthAxis.y  + z * widthAxis.z;
    const hP = x * heightAxis.x + y * heightAxis.y + z * heightAxis.z;
    if (wP < wMin) wMin = wP;
    if (wP > wMax) wMax = wP;
    if (hP < hMin) hMin = hP;
    if (hP > hMax) hMax = hP;
  }
  const totalW = wMax - wMin;
  const totalH = hMax - hMin;
  // Screen's own aspect ratio — used to "cover"-fit videos (fill + crop) instead
  // of stretching them to the UVs.
  m.userData.screenAspect = totalH > 1e-6 ? totalW / totalH : 1;

  const lookM = new THREE.Matrix4();
  const light = new THREE.RectAreaLight(
    new THREE.Color(params.maskColor),
    params.videoEmission, totalW, totalH
  );
  light.position.copy(center);
  lookM.lookAt(center, center.clone().add(avgN), up);
  light.quaternion.setFromRotationMatrix(lookM);
  m.add(light);
  m.userData.videoLight = light;
}

// ─── Apply functions ─────────────────────────────────────────────────────────
function applyColors() {
  // Drive the clear COLOR here (alpha is animated per-frame in animate()).
  renderer.setClearColor(new THREE.Color(params.bg), renderer.getClearAlpha());
  applyRingColor();

  layout.floorMeshes.forEach((m, i) => {
    const key = `floorColor${i + 1}`;
    if (params[key]) m.material.color.set(params[key]);
  });
  // Video planes stay white — the VideoTexture (or default white) shows through.
  // Their RectAreaLight color is computed per-frame in animate() by blending the
  // sampled video color with the mask color.
}

function applyLayout() {
  if (!layout.ready) return;

  const glbScale = params.floorRadius / layout.measuredFloorRadius;
  floorGroup.scale.setScalar(glbScale);
  videosGroup.scale.setScalar(glbScale);
  logoBaseScale = glbScale * params.logoExtraScale;
  logoGroup.scale.setScalar(logoBaseScale);

  const yShift = params.floorTargetY - layout.floorBboxMaxY * glbScale;
  const logoYAdjust = -layout.logoBboxMinY * glbScale * (params.logoExtraScale - 1);

  floorBase.set(
    -layout.floorCenter.x * glbScale,
    yShift,
    params.sceneZ - layout.floorCenter.z * glbScale
  );
  logoBase.set(
    -layout.floorCenter.x * glbScale * params.logoExtraScale,
    yShift + logoYAdjust + params.logoLiftY,
    params.sceneZ - layout.floorCenter.z * glbScale * params.logoExtraScale
  );

  floorGroup.position.copy(floorBase);
  // The pivot sits at the ring center in world space; offset videosGroup inside
  // it so the baked screen geometry still lands at floorBase.
  videosPivot.position.set(0, 0, params.sceneZ);
  videosGroup.position.set(
    floorBase.x - videosPivot.position.x,
    floorBase.y - videosPivot.position.y,
    floorBase.z - videosPivot.position.z,
  );
  logoGroup.position.copy(logoBase);
  logoGroup.rotation.y = params.logoRotationY * Math.PI / 180;

  // Don't override the in-flight logo animation with the resting position.
  if (logoAnim.phase === 'run') logoGroup.position.y = logoAnim.currentY;

  updateRingLightPosition();
  positionFloorReflector();
  positionRoofReflector();
  positionFloorOccluder();
  positionWell();
}

// ─── Responsive framing ──────────────────────────────────────────────────────
// Keeps the aspect correct and, on narrow (portrait/tablet) viewports, pulls the
// camera back so the wide ring of screens still fits — full composition visible,
// just smaller, with no wide-angle distortion. Landscape/desktop keep the base.
// ─── Cull screens that sweep past the camera ─────────────────────────────────
// The ring keeps turning with scroll, so a screen eventually comes all the way round
// to the camera's own side. The portrait pull-back leaves the camera almost exactly ON
// the ring (measured: ring radius 7.5 vs camDistanceEff 7.45 at 390×844), so instead
// of passing safely behind it, that screen sweeps THROUGH the camera and you catch its
// surface edge-on filling one side of the frame — review round 7.
//
// Fixed here rather than by lowering ringMaxRotationDeg, because the intrusion begins
// ~10-13° before the tour's end, so clamping it away would leave the final screen
// visibly off-centre. A screen you are effectively inside of carries no information, so
// just stop drawing it: no composition change, and it self-corrects for any aspect.
//
// Hidden via material.visible, NOT mesh.visible: each screen's RectAreaLight is a CHILD
// of the mesh, and three's projectObject() bails out early on an invisible object, so
// mesh.visible = false would drop that light too and pop the floor/ceiling lighting.
// material.visible only removes the draw. Masks are per-mesh materials, so they pair up.
const _cullSphere = new THREE.Sphere();
function cullScreensNearCamera() {
  const clearance = params.screenCameraClearance;
  if (!(clearance > 0) || !layout.videoMeshes.length) return;
  // World matrices for the freshly-applied ring rotation (the pivot subtree only).
  videosPivot.updateMatrixWorld(true);
  for (const m of layout.videoMeshes) {
    const bs = m.geometry.boundingSphere;
    if (!bs) continue;
    _cullSphere.copy(bs).applyMatrix4(m.matrixWorld);
    const gap = _cullSphere.center.distanceTo(camera.position) - _cullSphere.radius;
    const visible = gap > clearance;
    if (m.material.visible !== visible) {
      m.material.visible = visible;
      const mask = m.userData.maskMesh;
      if (mask) mask.material.visible = visible;
    }
  }
}

function updateFraming() {
  const a = viewportW() / viewportH();
  camera.aspect = a;
  camera.fov    = params.fov;
  const pull    = Math.max(1, params.framingRefAspect / a); // >1 only when narrower than ref
  const factor  = 1 + (pull - 1) * params.portraitFit;
  camDistanceEff = params.cameraDistance * factor;
  // Convert the TARGET SCREEN rest height (params.logoRestNdcY) into the world
  // gap the logo must sit below the camera's level optical axis. The logo rests
  // at horizontal distance camDistanceEff from the camera, so perspective gives
  //   ndcY = -(gap / camDistanceEff) / tan(fov/2)
  // Solving for gap and recomputing it here (updateFraming runs on every resize)
  // is what makes the resting position identical on every aspect ratio: as the
  // portrait pull-back pushes the camera further away, the gap grows to match.
  logoRestGap = Math.abs(params.logoRestNdcY)
    * Math.tan(params.fov * 0.5 * DEG_TO_RAD)
    * camDistanceEff;
  camera.updateProjectionMatrix();
}

// ─── Initial application ─────────────────────────────────────────────────────
rebuildRingLight();
applyColors();
updateFraming();

// ─── GLB load ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

function classifyMesh(name) {
  const n = name || '';
  if (/^curve/i.test(n)) return 'logo';
  if (/^screen/i.test(n)) return 'video';
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

  // Logo: keep load order.
  const logoMeshes = meshInfos.filter((i) => i.kind === 'logo').map((i) => i.mesh);
  // Videos: sort by name so Screen_00 → Plane 1, Screen_01 → Plane 2, etc.
  const videoMeshes = meshInfos
    .filter((i) => i.kind === 'video')
    .sort((a, b) => (a.mesh.name || '').localeCompare(b.mesh.name || ''))
    .map((i) => i.mesh);
  // Floor pieces: sort by Y center, lowest first.
  const floorInfos = meshInfos
    .filter((i) => i.kind === 'floor')
    .sort((a, b) => {
      const ay = (a.worldBox.max.y + a.worldBox.min.y) / 2;
      const by = (b.worldBox.max.y + b.worldBox.min.y) / 2;
      return ay - by;
    });
  const floorMeshes = floorInfos.map((i) => i.mesh);

  const unmatched = meshInfos.filter((i) => i.kind == null);
  if (unmatched.length) {
    console.warn('Unrecognized meshes (ignored):',
      unmatched.map((u) => u.mesh.name).join(', '));
  }

  floorMeshes.forEach((m, i) => {
    const key = `floorColor${i + 1}`;
    // The highest piece is the ceiling. When the ceiling MIRROR is off (mobile),
    // a metallic ceiling reflects the video RectAreaLights as bright rectangles
    // (a stray "white block"). With no mirror to show a real reflection, make it
    // a flat unlit dark material so it just reads as a plain black ceiling.
    const isCeiling = floorMeshes.length > 1 && i === floorMeshes.length - 1;
    if (isCeiling && !params.roofReflectorEnabled) {
      m.material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(params[key] ?? 0x010101),
        side:  THREE.DoubleSide,
      });
    } else {
      m.material = new THREE.MeshStandardMaterial({
        color: params[key] ?? 0x000000,
        metalness: params.floorMetalness,
        roughness: params.floorRoughness,
        side: THREE.DoubleSide,
      });
      m.material.onBeforeCompile = dropRectAreaSpecular;
    }
  });

  videoMeshes.forEach((m) => {
    m.material = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide,
    });
  });

  layout.floorMeshes = floorMeshes;
  layout.videoMeshes = videoMeshes;
  layout.logoMeshes  = logoMeshes;

  const logoBbox  = bakeIntoGroup(logoMeshes,  logoGroup,  logoMaterial);
  const floorBbox = bakeIntoGroup(floorMeshes, floorGroup, null);
  bakeIntoGroup(videoMeshes, videosGroup, null);

  // TEST: hide the floor dish (floorMeshes[0]) — the reflector mirror stays.
  if (!params.floorMeshVisible && floorMeshes[0]) floorMeshes[0].visible = false;

  // Cut the baked floor into its flat top surface (→ reflector geometry) and the
  // central well (→ its own metal material). See splitFloorGeometry.
  if (floorMeshes[0]) {
    const floorMesh = floorMeshes[0];
    const c = new THREE.Vector3();
    floorMesh.geometry.computeBoundingBox();
    floorMesh.geometry.boundingBox.getCenter(c);
    const split = splitFloorGeometry(floorMesh.geometry, c);
    layout.floorTopGeometry = split.topSurface;
    layout.floorTopY        = split.topY;
    if (split.well) {
      // Re-point the floor at everything-but-the-well, and add the well back as its
      // own mesh so it can be metal. Kept OUT of layout.floorMeshes on purpose: the
      // floorColorN keys and the "highest piece is the ceiling" rule both index that
      // array, so appending to it would silently shift both.
      const oldGeom = floorMesh.geometry;
      floorMesh.geometry = split.floorRest;
      // Carry the ORIGINAL full-floor bounding box across. Downstream layout reads
      // floorMeshes[0].geometry.boundingBox to derive measuredFloorRadius, floorCenter
      // and floorBboxMaxY — and yShift positions the whole floor from that maxY. If
      // the box shrank to "floor minus well" those would all shift and move the floor
      // vertically, so this keeps the split provably layout-neutral.
      split.floorRest.boundingBox = oldGeom.boundingBox.clone();
      oldGeom.dispose();
      const wellMesh = new THREE.Mesh(split.well, makeWellMaterial());
      wellMesh.name = 'FantanaWell';
      wellMesh.updateMatrix();          // identity — geometry is already in baked space
      wellMesh.matrixAutoUpdate = false;
      floorGroup.add(wellMesh);
      layout.wellMesh = wellMesh;
    }
  }

  // Per-screen area lights so the screens illuminate the floor and ceiling.
  // Lights are children of their plane mesh, so they inherit the group's
  // transform when the scene is repositioned/rescaled.
  if (videoMeshes.length > 0) {
    const sceneCenter = new THREE.Vector3();
    videoMeshes.forEach((m) => {
      const c = new THREE.Vector3();
      m.geometry.boundingBox.getCenter(c);
      sceneCenter.add(c);
    });
    sceneCenter.divideScalar(videoMeshes.length);

    layout.sceneCenter = sceneCenter.clone();

    videoMeshes.forEach((m) => {
      buildSlicedVideoLights(m, sceneCenter);

      m.userData.sampledVideoColor = new THREE.Color(0xffffff);
      m.userData.lastVideoColor    = new THREE.Color(0xffffff);

      // Hover-fade mask: frosted-glass shader that blurs the video texture and
      // tints it red. It sits EXACTLY over the video plane (same geometry, no
      // lateral offset) so no sliver of bare video shows at the edges; its
      // material uses polygonOffset to render just in front without z-fighting.
      const maskGeom = m.geometry.clone();
      const mask = new THREE.Mesh(maskGeom, makeMaskMaterial());
      // Render mask only into the main camera, not into the reflectors —
      // so the floor/ceiling mirrors see the bare video plane behind it.
      mask.layers.set(LAYER_MAIN_ONLY);
      // Overscan slightly (mobile) so the mask's edge covers the screen's silhouette
      // pixels instead of landing on them — see params.maskOverscan. Scaled about the
      // plane's own bbox centre: the geometry is baked into world space, so scaling
      // about the mesh origin instead would translate the mask right off the screen.
      const s = params.maskOverscan;
      if (s !== 1) {
        const mc = new THREE.Vector3();
        maskGeom.computeBoundingBox();
        maskGeom.boundingBox.getCenter(mc);
        mask.scale.setScalar(s);
        mask.position.copy(mc).multiplyScalar(1 - s);
      }
      m.add(mask);
      m.userData.maskMesh = mask;
      m.userData.hovered  = false;
    });
  }

  if (!logoBbox.isEmpty()) {
    layout.logoBboxMinY = logoBbox.min.y;
    // Feed the logo's local Y bounds to BOTH gradient shaders — the lit logo
    // material and the emissive exit shell — so they share one mapping and the
    // crossfade between them shows no shift in the gradient.
    gradientMaterial.uniforms.uMinY.value = logoBbox.min.y;
    gradientMaterial.uniforms.uMaxY.value = logoBbox.max.y;
    logoGradientUniforms.uMinY.value      = logoBbox.min.y;
    logoGradientUniforms.uMaxY.value      = logoBbox.max.y;
  }
  if (!floorBbox.isEmpty()) {
    // Use the lowest shell piece (the actual floor) for the floor-surface Y so
    // floorTargetY lands on the floor, not on the ceiling. Radius / center
    // still come from the lowest piece so floorRadius controls the visible
    // floor disc.
    const floorOnly = floorMeshes[0].geometry.boundingBox;
    layout.measuredFloorRadius = Math.max(
      floorOnly.max.x - floorOnly.min.x,
      floorOnly.max.z - floorOnly.min.z
    ) / 2;
    floorOnly.getCenter(layout.floorCenter);
    layout.floorBboxMaxY = floorOnly.max.y;
    // If there's a second (upper) shell piece, treat it as the ceiling and
    // capture its underside Y so the roof reflector can sit just below it.
    if (floorMeshes.length > 1) {
      const ceiling = floorMeshes[floorMeshes.length - 1].geometry.boundingBox;
      layout.ceilingBboxMinY = ceiling.min.y;
    }
  } else {
    console.warn('No floor mesh found — scaling will be off.');
    layout.measuredFloorRadius = 1;
  }
  layout.ready = true;

  applyLayout();

  // Bounding spheres for the near-camera screen cull (see cullScreensNearCamera).
  if (layout.videoMeshes.length) {
    layout.videoMeshes.forEach((m) => m.geometry.computeBoundingSphere());
  }
  rebuildFloorReflector();
  rebuildRoofReflector();
  rebuildFloorOccluder();
  rebuildWell();

  // ── Freeze static transforms (perf; provably zero visual change) ──────────
  // floorGroup / videosGroup / ringGroup / logoSpotTarget are transformed exactly
  // once — by applyLayout() / rebuildRingLight(), which run only here (no GUI
  // mutates params, and applyLayout is never called again — onResize does not call
  // it). Bake their current local matrix and stop per-frame recomposition.
  // videosGroup still ROTATES visually because its parent videosPivot (which keeps
  // auto-updating) force-updates its world every frame — only videosGroup's fixed
  // local offset is frozen. Combined with the scene-root freeze, the floor /
  // ceiling / screen-rig / spot-target matrices stop churning each frame.
  [floorGroup, videosGroup, ringGroup, logoSpotTarget].forEach((o) => {
    if (!o) return;
    o.updateMatrix();            // ensure .matrix holds the final local transform…
    o.matrixAutoUpdate = false;  // …then stop recomposing it every frame
  });

  outlinePass.selectedObjects = logoGroup.children.slice();

  // Emissive gradient "shells": one per logo mesh, same geometry, coincident with
  // the logo. They ride along inside logoGroup and crossfade in (uOpacity) as the
  // logo exits, so it stays readable diving into the unlit well where the LIT logo
  // material has no light left to catch. Same gradient colours and same local-Y
  // mapping as the logo material, so the crossfade only swaps lit → self-lit.
  // Added AFTER selectedObjects so the outline stays keyed to the logo only.
  layout.logoGradientMeshes = layout.logoMeshes.map((m) => {
    const shell = new THREE.Mesh(m.geometry, gradientMaterial);
    shell.renderOrder = 1;   // draw over the logo during the crossfade
    // Identity local transform, coincident with the logo; it rides logoGroup, so
    // its world is force-updated by the animated parent — freeze the local matrix.
    shell.updateMatrix();
    shell.matrixAutoUpdate = false;
    logoGroup.add(shell);
    return shell;
  });

  // Park the logo below its rest position until the intro plays so the loader
  // doesn't flash a static logo for a frame before the rise animation kicks in.
  // (It used to also be held at opacity 0 here; the intro opacity fade was dropped
  // in review round 2, so the position alone plus the loader overlay does this now.)
  logoGroup.position.y = logoBase.y - params.logoAnimRise;
  logoMaterial.transparent = true;
  logoMaterial.opacity     = 1;

  loadingState.glb = true;
  loadingState.videos = TEST_VIDEOS.map(() => false);
  // The fetches are already in flight (videoLoads, module scope) — this only
  // wires the arrived videos onto the freshly-built planes.
  attachVideos().then((results) => {
    results.forEach((ok, i) => { loadingState.videos[i] = true; });
    checkAllLoaded();
  });
  checkAllLoaded(); // in case there are zero videos
}, undefined, (err) => console.error('GLB load failed:', err));

// ─── Scroll → ring rotation ──────────────────────────────────────────────────
// The camera stays fixed at its initial pose. Scrolling the page rotates the
// ring of screens behind the logo (videosPivot.rotation.y, applied in animate).
// Locally the tall #scroll-spacer gives window.scrollY range; in Webflow the
// sticky section's scroll produces the same 0→1 progress.
let scrollProgress = 0;
let videosRotY     = params.ringStartRotationDeg * DEG_TO_RAD;  // start already framed
let logoTiltX      = 0;   // damped mouse tilt, radians about the WORLD X axis
let logoTiltY      = 0;   // damped mouse tilt, radians about the WORLD Y axis
// Scratch objects for composing the logo's orientation (allocated once — animate
// runs every frame).
const AXIS_Y        = new THREE.Vector3(0, 1, 0);
const logoSpinQuat  = new THREE.Quaternion();
const logoTiltQuat  = new THREE.Quaternion();
const logoTiltEuler = new THREE.Euler();
let logoExitDamped = 0;   // damped scroll-exit amount — smooths the intro→scroll handoff
let logoContinuedDamped = 0;  // damped extra descent beyond the exit (logo keeps going down)
let logoSpinAngle       = 0;  // damped spin (like a top) after the gradient transition
let logoBaseScale       = 1;  // logoGroup scale at rest (glbScale * logoExtraScale); shrunk during the descent

// The tall scroll track. In Webflow it's the #cc-hero section (the sticky child
// #cc-sticky pins while the page scrolls through it); locally it's absent and we
// fall back to whole-page scroll driven by #scroll-spacer.
const scrollTrackEl = document.getElementById('cc-hero');
// Cached layout metrics for the scroll track. updateScrollProgress() runs every
// frame from animate(), so it must NOT trigger a getBoundingClientRect() /
// scrollHeight layout read there. These metrics depend only on layout, not on the
// current scroll offset, so they're recomputed just on scroll + resize; the
// per-frame reader below derives progress from the live window.scrollY alone.
//   trackAbsTop   = the track's document-absolute top (rect.top + scrollY). Scroll
//                   invariant — rect.top at any instant is (trackAbsTop - scrollY).
//   trackRange    = rect.height - innerHeight (the section's scrollable span).
//   pageScrollMax = fallback whole-page scroll range (no #cc-hero present).
let trackAbsTop   = 0;
let trackRange    = 0;
let pageScrollMax = 0;
// STABLE viewport height for the scroll maths — deliberately NOT window.innerHeight.
//
// On mobile the browser's URL bar collapses on scroll-down and returns on scroll-up,
// which changes window.innerHeight by ~60-120px mid-scroll. Feeding that live value
// into trackRange below means the SAME scrollY maps to a DIFFERENT scrollProgress
// before and after the bar moves, so the whole scene jumps — which is the "cateodata
// da snap la alta sectiune / comportament weird" from review round 6. It also fights
// the page: our jump changes nothing about scrollY, but the user reads it as the page
// having moved.
//
// Only ever GROW it. The tall value (URL bar hidden) is the one that matches CSS `vh`
// / `lvh` units, which is what the Webflow section heights and our own #app use — so
// the maximum is the height the layout was actually built against. Growing-only makes
// it converge to that within the first scroll gesture and then stay put forever.
// Orientation change legitimately changes the viewport, so reset there.
let stableViewportH = window.innerHeight;
function noteViewportHeight() {
  if (window.innerHeight > stableViewportH) stableViewportH = window.innerHeight;
}
function resetStableViewportH() { stableViewportH = window.innerHeight; }

function recomputeScrollMetrics() {
  noteViewportHeight();
  if (scrollTrackEl) {
    const rect = scrollTrackEl.getBoundingClientRect();
    trackAbsTop = rect.top + window.scrollY;
    trackRange  = rect.height - stableViewportH;
  } else {
    pageScrollMax = document.documentElement.scrollHeight - stableViewportH;
  }
}
function updateScrollProgress() {
  if (scrollTrackEl) {
    // Section-relative progress: 0 when the section top reaches the viewport top,
    // 1 when its bottom reaches the viewport bottom (i.e. the sticky child has
    // traveled its full range and is about to unpin). rect.top is reconstructed
    // from the cached absolute top and the live scrollY — no layout read here, and
    // mathematically identical to getBoundingClientRect().top.
    const top = trackAbsTop - window.scrollY;
    scrollProgress = trackRange > 0 ? Math.min(1, Math.max(0, -top / trackRange)) : 0;
  } else {
    scrollProgress = pageScrollMax > 0 ? Math.min(1, Math.max(0, window.scrollY / pageScrollMax)) : 0;
  }
}
// Refresh the cached metrics on scroll (one layout read per scroll event — the
// same read the per-frame path used to do, now moved OFF the render loop) and on
// resize (see onResize). Live window.scrollY still drives progress every frame, so
// smooth-scroll (Lenis) interpolation between scroll events stays in sync.
window.addEventListener('scroll', () => { recomputeScrollMetrics(); updateScrollProgress(); }, { passive: true });
recomputeScrollMetrics();
updateScrollProgress();

// Hover detection over the video planes (drives the frosted-mask fade). Uses
// world matrices, so it keeps working as the ring rotates.
const raycaster = new THREE.Raycaster();
const ndcMouse  = new THREE.Vector2();

window.addEventListener('pointermove', (e) => {
  ndcMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  ndcMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndcMouse, camera);
  const hits = raycaster.intersectObjects(layout.videoMeshes, false);
  layout.videoMeshes.forEach((m) => (m.userData.hovered = false));
  if (hits.length > 0) hits[0].object.userData.hovered = true;
});

// ─── Touch drag → spin the logo (mobile) ─────────────────────────────────────
// The mouse TILT can't work on touch (there is no hover, so ndcMouse stays at 0,0),
// so give phones the equivalent gesture: drag and hold to turn the logo.
//
// HORIZONTAL drag only, and deliberately NOT preventDefault'd. A vertical drag is the
// page scroll — which is what drives this whole scene — so consuming it would break the
// hero, and even tracking it would fight the scroll. Horizontal movement is free.
// The delta feeds the same damped yaw the desktop tilt uses (logoTiltY), so it inherits
// the smooth easing rather than snapping to the finger, and it eases back to rest on
// release. logoDragRate is separate from logoTiltRate and lower on purpose: "smooth, nu
// agresiv".
let dragYawTarget = 0;      // radians, added onto the tilt's yaw target
let dragPointerId = null;
let dragStartX    = 0;
let dragStartYaw  = 0;

function dragBegin(e) {
  if (dragPointerId !== null) return;
  if (e.pointerType === 'mouse') return;   // desktop already has the cursor tilt
  dragPointerId = e.pointerId;
  dragStartX    = e.clientX;
  dragStartYaw  = dragYawTarget;           // continue from where it currently sits
}
function dragMove(e) {
  if (e.pointerId !== dragPointerId) return;
  // Normalise by viewport width so the gesture feels the same on any screen: a full
  // screen-width swipe is logoDragYawDeg of turn.
  const frac = (e.clientX - dragStartX) / Math.max(1, window.innerWidth);
  const max  = params.logoDragMaxDeg * DEG_TO_RAD;
  dragYawTarget = Math.max(-max, Math.min(max,
    dragStartYaw + frac * params.logoDragYawDeg * DEG_TO_RAD));
}
function dragEnd(e) {
  if (e.pointerId !== dragPointerId) return;
  dragPointerId = null;
  dragYawTarget = 0;        // ease back to rest (animate() damps it, so no snap)
}
window.addEventListener('pointerdown',   dragBegin, { passive: true });
window.addEventListener('pointermove',   dragMove,  { passive: true });
window.addEventListener('pointerup',     dragEnd,   { passive: true });
window.addEventListener('pointercancel', dragEnd,   { passive: true });

// (Comet trail removed — no longer used on desktop or mobile.)
// (Camera orbit dial removed — the camera is fixed now; scroll drives the ring.)

// ─── Resize ──────────────────────────────────────────────────────────────────
// Last size the renderer was actually configured for. The mobile URL-bar show/hide
// fires resize + visualViewport resize constantly during a scroll, but #app is sized
// in stable large-viewport units, so its client size usually has NOT changed. Doing
// the full reframe + RT reallocation on every one of those events is what made the
// scene feel like it was "resizing aggressively" (review round 6) — each realloc is a
// hitch, and updateFraming() nudges the camera. So do the expensive work only when the
// mount element's size genuinely changed.
let lastResizeW = 0;
let lastResizeH = 0;
function onResize() {
  const w = viewportW(), h = viewportH();
  if (w !== lastResizeW || h !== lastResizeH) {
    lastResizeW = w;
    lastResizeH = h;
    updateFraming();  // aspect + responsive pull-back for portrait/tablet
    // Re-apply the CURRENT renderScale at the new viewport size (updateStyle=false —
    // CSS keeps the canvas at 100% of #app). Routing through applyRenderScale rather
    // than hardcoding the base pixel ratio is essential: this handler also fires on
    // the mobile URL-bar show/hide (via visualViewport), and hardcoding BASE_PR
    // would snap resolution back to full mid-session, undoing an adaptive downscale.
    applyRenderScale();
  }
  // Always refresh the cached track metrics — the section's box can move even when
  // our canvas size did not. These now key off stableViewportH, so a URL-bar nudge
  // no longer shifts scrollProgress (see recomputeScrollMetrics).
  recomputeScrollMetrics();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => {
  // A real viewport change — the stable height must be re-learned, not kept at the
  // previous orientation's (much larger) value, or trackRange goes negative.
  resetStableViewportH();
  lastResizeW = lastResizeH = 0;   // force the full reframe below
  onResize();
});
// visualViewport fires on mobile URL-bar show/hide and rotation, where the plain
// resize event is unreliable — keeps the canvas/aspect locked to the real screen.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onResize);
}


// ─── Video attachment + per-screen color sampling ───────────────────────────
// Each video autoplays muted/looped. Its average frame color is sampled at
// 8×8 every 100 ms and damped into the matching RectAreaLight so the
// floor/ceiling reflections track the video colors.
const SAMPLE_SIZE = 8;
const _sampleCanvas = document.createElement('canvas');
_sampleCanvas.width = SAMPLE_SIZE;
_sampleCanvas.height = SAMPLE_SIZE;
const _sampleCtx = _sampleCanvas.getContext('2d', { willReadFrequently: true });

// Wires an already-loading video (see startVideo / videoLoads above) onto its
// GLB plane. Resolves once the texture is attached — or immediately false if the
// video failed or the plane is missing.
function attachVideo(index) {
  const load = videoLoads[index];
  if (!load) { console.warn('attachVideo: no video load at index', index); return Promise.resolve(false); }
  return load.ready.then((ok) => {
    if (!ok) return false;
    const video = load.video;
    const mesh  = layout.videoMeshes[index];
    if (!mesh) { console.warn('attachVideo: no plane at index', index); return false; }

    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // GLB plane UVs expect non-flipped video

    // Cover-fit: fill the screen and crop the excess instead of stretching the
    // video. Compares the video's aspect to the screen's and zooms the texture.
    // videoWidth/videoHeight are the DISPLAY dimensions (the browser has already
    // applied any pixel aspect ratio), so this is correct even for anamorphic
    // sources — the files are square-pixel now, but the guarantee still holds.
    const screenAspect = mesh.userData.screenAspect || 1;
    const videoAspect  = (video.videoWidth || 16) / (video.videoHeight || 9);
    let rx = 1, ry = 1;
    if (videoAspect > screenAspect) rx = screenAspect / videoAspect; // crop sides
    else                            ry = videoAspect / screenAspect; // crop top/bottom
    const ox = (1 - rx) / 2, oy = (1 - ry) / 2;
    tex.repeat.set(rx, ry);
    tex.offset.set(ox, oy);

    mesh.material.map = tex;
    mesh.material.color.set(0xffffff);
    mesh.material.needsUpdate = true;
    // Feed the same texture + cover transform into the mask shader.
    const mask = mesh.userData.maskMesh;
    if (mask?.material?.uniforms) {
      mask.material.uniforms.uVideo.value = tex;
      mask.material.uniforms.uUvScale.value.set(rx, ry);
      mask.material.uniforms.uUvOffset.value.set(ox, oy);
    }
    mesh.userData.videoElement = video;
    mesh.userData.videoTexture = tex;
    // play() already fired in startVideo the moment data arrived; this is just a
    // safety net for the case where that attempt was rejected (e.g. a policy
    // change) and the element is sitting paused.
    if (video.paused) video.play().catch(() => {});
    return true;
  });
}

function attachVideos() {
  return Promise.all(videoLoads.map((_, i) => attachVideo(i)));
}


// Periodically average each video's frame into its sampled target. animate()
// eases the displayed lastVideoColor toward this target so the reflection
// doesn't flicker on every sample.
const PIXELS = SAMPLE_SIZE * SAMPLE_SIZE;
setInterval(() => {
  for (const mesh of layout.videoMeshes) {
    const video = mesh.userData.videoElement;
    if (!video || video.readyState < 2) continue;
    try {
      _sampleCtx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = _sampleCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      mesh.userData.sampledVideoColor.setRGB(
        r / (PIXELS * 255), g / (PIXELS * 255), b / (PIXELS * 255)
      );
    } catch (e) { /* tainted canvas or not-ready frame — skip */ }
  }
}, 100);

// ─── Render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
// Visibility gating: the loop runs ONLY while the scene is both on-screen and
// the tab is foreground, so the GPU work actually stops when scrolled away or
// backgrounded (saves battery / frees frame budget for the rest of the page).
// Two independent signals — onscreen (IntersectionObserver on the mount element)
// and pageVisible (document visibility) — must BOTH be true. rafId/running let
// stopLoop() truly cancel the frame and keep startLoop() idempotent.
let rafId       = null;
let running     = false;
let onscreen    = true;              // set for real by the observer's first callback
let pageVisible = !document.hidden;
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
const lookTarget    = new THREE.Vector3();
const _maskColor    = new THREE.Color();
const _blendedLight = new THREE.Color();

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 30);

  // Sample the (possibly smooth-scrolled, e.g. Lenis) scroll position every frame
  // rather than only on native 'scroll' events. Smooth-scroll libraries advance
  // window.scrollY in their own rAF loop; reading it here keeps the scene in sync
  // with that interpolated value, avoiding stutter. The scroll listener stays as
  // a fallback for when the loop is idle.
  updateScrollProgress();

  // Scroll rotates the ring of screens behind the logo; the camera stays fixed.
  // ringStartRotationDeg frames the initial view; scroll adds rotation on top.
  let scrollTargetDeg = params.ringStartRotationDeg + scrollProgress * params.scrollMaxRotationDeg;
  // Clamp the ring rotation on mobile so it can't swing the first screen back
  // into the camera (see IS_MOBILE block). Undefined on desktop → no clamp.
  if (params.ringMaxRotationDeg != null) {
    scrollTargetDeg = Math.min(scrollTargetDeg, params.ringMaxRotationDeg);
  }
  const scrollTargetAngle = scrollTargetDeg * DEG_TO_RAD;
  videosRotY = damp(videosRotY, scrollTargetAngle, params.scrollFollowRate, dt);
  videosPivot.rotation.y = videosRotY;

  // Mask opacity + matching light color so the reflection tracks what you see.
  _maskColor.set(params.maskColor);
  const colorMix = 1 - Math.exp(-params.videoColorSmoothRate * dt);
  const tNow = performance.now() / 1000;
  for (const m of layout.videoMeshes) {
    const mask  = m.userData.maskMesh;
    const light = m.userData.videoLight;
    if (!mask) continue;
    const u = mask.material.uniforms;
    const target = m.userData.hovered ? 0 : params.maskBaseOpacity;
    u.uOpacity.value     = damp(u.uOpacity.value, target, params.maskFadeRate, dt);
    u.uBlur.value        = params.maskBlur;
    u.uNoiseAmount.value = params.maskNoiseAmount;
    u.uTime.value        = tNow * params.maskNoiseSpeed;
    // Ease the displayed color toward the most-recent sample to kill flicker.
    m.userData.lastVideoColor.lerp(m.userData.sampledVideoColor, colorMix);
    if (light) {
      const lightAlpha = u.uOpacity.value * params.lightMaskInfluence;
      light.color.copy(m.userData.lastVideoColor).lerp(_maskColor, lightAlpha);
    }
  }

  // ── Logo lifecycle (fully continuous — no hard phase gating) ─────────────
  // Intro (rise + fade-in + outline + spot) is time-based, but SCROLL fast-
  // forwards it so the user never has to wait: intro is forced complete by the
  // time the exit begins (logoExitStart). Exit (sink under the ring) is scroll-
  // driven and damped. This means logo + camera track scroll from the first
  // frame, even mid-intro, with no teleport.
  let introEased = 0, outlineRamp = 0, spotEased = 0, exitTarget = 0;
  if (logoAnim.phase === 'run') {
    const elapsed = performance.now() / 1000 - logoAnim.phaseStart;
    const introFromTime   = Math.min(1, elapsed / params.logoAnimDuration);
    const introFromScroll = params.logoExitStart > 0
      ? Math.min(1, scrollProgress / params.logoExitStart)
      : 1;
    const introProgress = Math.max(introFromTime, introFromScroll);
    introEased  = 1 - Math.pow(1 - introProgress, 3);      // easeOutCubic
    const ot    = Math.max(0, (introProgress - 0.5) * 2);  // outline kicks in at halfway
    outlineRamp = 1 - Math.pow(1 - ot, 3);
    // Spotlight has its own (longer) time ramp, but scroll fast-forwards it too.
    const spotProgress = Math.max(Math.min(1, elapsed / params.spotAnimDuration), introFromScroll);
    spotEased = 1 - Math.pow(1 - spotProgress, 3);
    // Exit: scroll past logoExitStart.
    const span  = params.logoExitEnd - params.logoExitStart;
    const exitT = span > 0
      ? Math.min(1, Math.max(0, (scrollProgress - params.logoExitStart) / span))
      : 0;
    exitTarget = exitT * exitT * (3 - 2 * exitT);          // smoothstep
  }
  logoExitDamped = damp(logoExitDamped, exitTarget, params.logoExitFollowRate, dt);
  const exitEased = logoExitDamped;
  // Transition drop (0..logoExitDrop) — the camera follows THIS (through the floor).
  const transitionOffsetY = -exitEased * params.logoExitDrop;
  // Beyond logoExitEnd the logo eases DOWN to a bounded final rest (it does NOT
  // keep falling out of view) and spins like a top. beyondT normalises the
  // remaining scroll (logoExitEnd..1) → 0..1, smoothstep so it settles softly at
  // the end. The camera follows only part of this (see below), so the logo comes
  // to rest low in the frame — its final position.
  const beyondExit = Math.max(0, scrollProgress - params.logoExitEnd);
  const beyondT     = (1 - params.logoExitEnd) > 0
    ? Math.min(1, beyondExit / (1 - params.logoExitEnd))
    : 0;
  const beyondEased = beyondT * beyondT * (3 - 2 * beyondT);   // smoothstep → settles
  logoContinuedDamped = damp(logoContinuedDamped, beyondEased * params.logoContinueDrop, params.logoExitFollowRate, dt);
  logoSpinAngle       = damp(logoSpinAngle, beyondExit * params.logoSpinDeg * DEG_TO_RAD, params.logoExitFollowRate, dt);
  const logoExitOffsetY = transitionOffsetY - logoContinuedDamped;

  // Mouse tilt runs constantly (does not wait for the intro). ndcMouse is kept up
  // to date by the pointermove handler. The logo leans AWAY from the cursor:
  //   cursor right (+x) → +Y rotation, which swings the logo's +X edge to −Z, i.e.
  //                       the right edge goes back and the left comes forward;
  //   cursor high  (+y) → −X rotation, which sends the top edge back the same way.
  // On touch there is no pointermove, so ndcMouse stays (0,0) and this is inert.
  // Separate amounts per axis: the yaw (side to side) carries the effect, the pitch
  // (front/back) is kept small on purpose so the logo doesn't rock toward the camera.
  // The touch drag adds onto the same yaw the cursor tilt drives, so both paths share
  // one damped value and can never fight each other. While a finger is down (or easing
  // back after release) use the gentler logoDragRate.
  const yawRate = (dragPointerId !== null || Math.abs(dragYawTarget - logoTiltY) > 1e-4)
    ? params.logoDragRate
    : params.logoTiltRate;
  logoTiltX = damp(logoTiltX, -ndcMouse.y * params.logoTiltPitchDeg * DEG_TO_RAD, params.logoTiltRate, dt);
  logoTiltY = damp(
    logoTiltY,
    ndcMouse.x * params.logoTiltYawDeg * DEG_TO_RAD + dragYawTarget,
    yawRate, dt,
  );

  // Camera stays fixed in its horizontal position; only its HEIGHT follows the
  // logo, and it keeps looking LEVEL (constant pitch) — it does NOT tilt to chase
  // the logo. It tracks the transition drop 1:1 (blackout works), but in the
  // empty space follows all of it EXCEPT logoRestGap world units. Both the
  // look target and the camera move by the same amount, so the logo — which sinks
  // the full distance — drifts DOWN toward the bottom of the frame. The logo
  // shrinks as it goes (see below), so it stays in view instead of exiting.
  const restLookY = logoBase.y + params.lookOffsetY;
  // The camera follows the whole continued sink MINUS logoRestGap, so the logo
  // ends exactly logoRestGap below the optical axis → at params.logoRestNdcY on
  // screen. logoRestGap is aspect-derived (updateFraming), so this lands at the
  // same screen height on a phone, a tall/narrow window and a desktop alike.
  // Scaled by the descent's own progress so the gap opens up gradually instead of
  // snapping in, and clamped in case logoRestGap ever exceeds the total drop.
  const contFollow = params.logoContinueDrop > 0
    ? Math.min(1, Math.max(0, 1 - logoRestGap / params.logoContinueDrop))
    : 0;
  const followY   = (transitionOffsetY - logoContinuedDamped * contFollow) * params.cameraFollowExit;
  lookTarget.set(
    logoBase.x + params.lookOffsetX,
    restLookY + followY,
    logoBase.z + params.lookOffsetZ,
  );
  camera.position.set(
    lookTarget.x,
    restLookY + params.cameraHeight + followY,
    lookTarget.z + camDistanceEff,
  );
  camera.lookAt(lookTarget);

  // Now that the camera pose and the ring rotation are both final for this frame, drop
  // any screen that is sweeping through the camera (review round 7).
  cullScreensNearCamera();

  // "Concrete" blackout: fade the whole view to black while the camera crosses
  // the floor, then clear below it. Driven by camera height vs the floor surface.
  if (blackoutEl) {
    const top = params.floorTargetY;
    const y   = camera.position.y;
    let o = 0;
    if (params.blackoutEnabled) {
      if      (y >= top + params.blackoutFadeIn) o = 0;                                   // above floor
      else if (y >= top)                          o = (top + params.blackoutFadeIn - y) / params.blackoutFadeIn; // fade in
      else if (y >= top - params.blackoutDepth)   o = 1;                                   // fully black (in the floor)
      else if (y >= top - params.blackoutDepth - params.blackoutFadeOut)
        o = (y - (top - params.blackoutDepth - params.blackoutFadeOut)) / params.blackoutFadeOut;                // fade out below
      else o = 0;                                                                          // clear below → see the logo
    }
    blackoutEl.style.opacity = String(o);
  }

  // Canvas transparency in the well. Clear alpha stays 1 (opaque dark) while the
  // camera is above the floor — the room + gaps hide the DOM text and background
  // lines behind the canvas. Once the camera sinks past the floor into the empty
  // well, fade it to 0 so those show THROUGH the canvas while the opaque logo
  // stays in front. Same depth band as the blackout fade-out, so the black DOM
  // overlay covers the switch. pointer-events follows: 'none' once transparent so
  // the DOM text/buttons behind become clickable.
  if (params.voidTransparency) {
    const top = params.floorTargetY;
    const y   = camera.position.y;
    const fadeStart = top - params.blackoutDepth;                       // still opaque at/above here
    const fadeEnd   = top - params.blackoutDepth - params.blackoutFadeOut; // fully transparent here
    let a = 1;
    if      (y >= fadeStart) a = 1;
    else if (y <= fadeEnd)   a = 0;
    else                     a = (y - fadeEnd) / (fadeStart - fadeEnd);
    renderer.setClearAlpha(a);
    renderer.domElement.style.pointerEvents = a > 0.99 ? 'auto' : 'none';
  }

  if (logoAnim.phase === 'run') {
    // Vertical = rise offset (intro) + exit offset (scroll), both continuous.
    const riseOffsetY = -(1 - introEased) * params.logoAnimRise;
    logoAnim.currentY = logoBase.y + riseOffsetY + logoExitOffsetY;
    logoGroup.position.set(logoBase.x, logoAnim.currentY, logoBase.z);
    // Orientation = mouse tilt ∘ (base facing + top-spin). The spin around Y is
    // gentle and one-directional, and kicks in right as the gradient transition
    // finishes. The tilt is composed on the LEFT so it applies in PARENT space:
    // logoGroup's parent is the untransformed scene root, so parent space is world
    // space and the tilt axes line up with the screen. Writing the tilt into
    // logoGroup.rotation instead would tilt around the logo's already-rotated
    // LOCAL axes — the lean direction would be skewed by logoRotationY and would
    // then swing right around as soon as the top-spin started.
    logoSpinQuat.setFromAxisAngle(AXIS_Y, params.logoRotationY * DEG_TO_RAD + logoSpinAngle);
    logoTiltEuler.set(logoTiltX, logoTiltY, 0);
    logoTiltQuat.setFromEuler(logoTiltEuler);
    logoGroup.quaternion.copy(logoTiltQuat).multiply(logoSpinQuat);
    // Shrink the logo as it sinks into the empty space — smaller the further it
    // goes down. Normalised against the continued descent → eases to
    // logoExitMinScale at full scroll. Uses the damped descent value → smooth.
    const shrinkT = params.logoContinueDrop > 0
      ? Math.min(1, logoContinuedDamped / params.logoContinueDrop)
      : 0;
    const logoScale = logoBaseScale * (1 - shrinkT * (1 - params.logoExitMinScale));
    logoGroup.scale.setScalar(logoScale);
    // The logo fades in during the intro; the emissive gradient shell crossfades
    // in over it as the logo exits, but only AFTER logoGradientStart (so it kicks
    // in once the camera is down in the floor, not the moment the exit begins).
    // Remap exitEased into [logoGradientStart..1] → [0..1]. The neon outline fades
    // out as the gradient takes over, leaving the pure gradient shape.
    const gStart = params.logoGradientStart;
    const gradT = gStart < 1
      ? Math.min(1, Math.max(0, (exitEased - gStart) / (1 - gStart)))
      : (exitEased > 0 ? 1 : 0);
    // True crossfade on the way OUT: fade the LIT logo out as the self-lit shell
    // fades in. Both carry the same gradient, so this reads as the lighting dropping
    // away rather than as a material swap. (Under the old transmissive glass this
    // also had to drive transmission→0, because a transmissive material is drawn in
    // a separate, LAST pass that ignored renderOrder and fought the shell. No longer
    // an issue — the logo is a plain MeshStandardMaterial and obeys renderOrder.)
    //
    // No `introEased` factor: review round 2 asked to drop the intro opacity fade,
    // so the logo is fully opaque from its first frame and the intro is the RISE
    // alone. It still starts below the floor and the loader overlay is still up, so
    // nothing pops into view — introEased continues to drive the rise and the spot.
    logoMaterial.opacity = 1 - gradT;
    gradientMaterial.uniforms.uOpacity.value = gradT;
    outlinePass.edgeStrength = params.outlineStrength * outlineRamp * (1 - gradT);
    // SKIP the whole OutlinePass while it contributes nothing. At edgeStrength 0
    // the pass is invisible, but it still costs TWO full-scene re-renders (its
    // depth + mask buffers) plus ~7 fullscreen passes on FULL-RESOLUTION
    // HalfFloat RTs every frame — three's OutlinePass hardcodes HalfFloatType on
    // 5 of its 7 internal buffers, so with downSampleRatio = 1 this is by far the
    // heaviest thing in the chain on a phone. It is genuinely invisible at 0:
    // before the intro ramp starts (outlineRamp 0) and once the gradient shell has
    // fully taken over (gradT 1, which on mobile is everything past scroll 0.68 —
    // roughly a THIRD of the scroll). Free win, no visual change whatsoever.
    outlinePass.enabled = outlinePass.edgeStrength > 0.001;
    if (logoSpot) logoSpot.intensity = params.ringIntensity * spotEased;
  }

  // ── Adaptive resolution monitor (GPU timer query) ───────────────────────────
  // Judge load on the TRUE GPU frame time via a TIME_ELAPSED_EXT timer query
  // wrapped around composer.render() (below). This is vsync-INDEPENDENT: a capable
  // GPU reads its real ~1-3ms cost (never over budget → never downscales) while a
  // struggling one reads its real >13ms cost and steps down. Only ONE query is ever
  // in flight — poll the previously-issued one here, then (further down) issue the
  // next one around the render. When the extension is unavailable (rsExt === null,
  // e.g. Safari) this whole block is inert and renderScale stays pinned at 1.0.
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
        // Fold the true GPU cost into a slow EMA (seed on the first real sample).
        if (rsSeeded) rsGpuMs += (gpuMs - rsGpuMs) * 0.1;
        else { rsGpuMs = gpuMs; rsSeeded = true; }
        if (rsCooldown > 0) rsCooldown--;
        // Sustain counters: consecutive samples over budget / within headroom. The
        // 8–13ms deadband between them (plus the cooldown) prevents oscillation.
        rsOverCount  = rsGpuMs > RS_BUDGET_MS   ? rsOverCount + 1  : 0;
        rsUnderCount = rsGpuMs < RS_HEADROOM_MS ? rsUnderCount + 1 : 0;

        if (rsOverCount >= RS_DOWN_SAMPLES && rsCooldown === 0 && rsIndex < RS_STEPS.length - 1) {
          // Sustained over-budget → drop a step. On a capable GPU rsGpuMs is tiny
          // (~1-3ms) ≪ RS_BUDGET_MS, so rsOverCount never climbs → this never fires
          // → renderScale stays 1.0 → byte-identical output.
          rsIndex++;
          renderScale = RS_STEPS[rsIndex];
          applyRenderScale();          // (also bumps rsSettle + clears the counters)
          rsOverCount  = 0;
          rsUnderCount = 0;
          rsCooldown   = RS_COOLDOWN;
        } else if (rsUnderCount >= RS_UP_SAMPLES && rsCooldown === 0 && rsIndex > 0) {
          // Sustained measured headroom → reclaim a step. No probe/backoff needed:
          // the headroom is directly measured, not inferred from the vsync interval.
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

  // Advance the reflector cadence counter once per rendered frame so the gated
  // mirrors (makeBlurredReflector) refresh their RT every REFLECTION_EVERY-th
  // frame. Do this immediately before rendering, where the reflectors' gated
  // onBeforeRender callbacks read it.
  reflectorFrame++;

  // Wrap the frame's GPU render section in ONE timer query — only when the
  // extension is supported AND no query is still pending (never nest; only one
  // TIME_ELAPSED query may be active at a time). beginQuery immediately BEFORE the
  // render, endQuery immediately AFTER. For this hero the render section is the
  // single composer.render() call.
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
// accrued while paused (clock.getDelta() once, thrown away) so the first resumed
// frame doesn't get a huge dt → no visual jump / physics blowup.
function startLoop() {
  if (running) return;
  running = true;
  clock.getDelta();
  // Reset the adaptive-resolution GPU-timer signal on resume. While paused the loop
  // is fully stopped (nothing measured), and after a long idle the GPU timer state
  // is untrustworthy, so discard any pending query and the EMA/counters and skip a
  // couple of measured samples while timing re-settles — a post-pause spike (or a
  // stale reading) then can't cause a spurious downscale.
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
});
loopObserver.observe(appEl);

document.addEventListener('visibilitychange', () => {
  pageVisible = !document.hidden;
  syncLoop();
});

syncLoop();
