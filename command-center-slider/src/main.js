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
// MSAA smooths geometry edges (screen borders, logo silhouette). Enabled on
// mobile too (4×) now that the RT is 8-bit there — the low-bandwidth RT keeps
// the MSAA affordable, and it kills the "stairs" on the video/logo edges.
const MSAA_SAMPLES       = IS_MOBILE ? 4   : 2;
// Reflectors render the whole scene into a texture — the biggest GPU cost. On
// mobile keep ONLY the floor mirror (so the videos still read as reflected) at a
// lower RT scale (it only needs to look "reflective", not crisp), and drop the
// ceiling mirror (a second full-scene render is too expensive on phones).
const REFLECTOR_RT_SCALE   = IS_MOBILE ? 0.3 : 0.5;
const ENABLE_FLOOR_REFLECTOR = true;         // floor mirror on both (mobile at reduced RT)
const ENABLE_ROOF_REFLECTOR  = !IS_MOBILE;   // ceiling mirror desktop-only
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
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
// updateStyle=false: we only drive the drawing-buffer size and set the canvas
// CSS to fill its container ourselves (below), so it works whether or not the
// host page has a `#app canvas { width:100% }` rule.
renderer.setSize(viewportW(), viewportH(), false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.display = 'block';
renderer.domElement.style.width   = '100%';
renderer.domElement.style.height  = '100%';
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
blackoutEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2;pointer-events:none;opacity:0';
document.body.appendChild(blackoutEl);

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
  logoGroup.position.y      = logoAnim.currentY;
  glassMaterial.transparent = true;
  glassMaterial.opacity     = 0;
  outlinePass.edgeStrength  = 0;
  if (logoSpot) logoSpot.intensity = 0;
}

// ─── Scene + camera + lights ─────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFCFCFA);

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
outlinePass.downSampleRatio = 1;  // full-res edge buffers everywhere — kills the neon-outline stairs on the logo (mobile included)
outlinePass.visibleEdgeColor.set('#f95921');
outlinePass.hiddenEdgeColor.set('#f95921');
composer.addPass(outlinePass);
// SMAA smooths the outline's post-process edges (which MSAA can't touch
// since they're drawn after the resolved render pass).
const pr = renderer.getPixelRatio();
composer.addPass(new SMAAPass(viewportW() * pr, viewportH() * pr));
composer.addPass(new OutputPass());

// Only the ring spotlight and the per-screen RectAreaLights illuminate the
// scene — no ambient / key / fill. Anything outside those cones stays black.

// ─── Tunable params ──────────────────────────────────────────────────────────
const params = {
  // Background / colors
  bg:             '#010101',
  gradientTop:    '#FFC34B',
  gradientBottom: '#F95921',

  floorColor1: '#a00d00',
  floorColor2: '#010101',
  floorColor3: '#010101',
  floorColor4: '#010101',
  // Reflectivity / emission
  floorMetalness: 0.6,
  floorRoughness: 0.25,
  videoEmission:  4,

  // Floor planar reflector (gives a real, curved mirror reflection of the
  // screens — ring shape so the inner well around the logo isn't covered).
  reflectorEnabled:    ENABLE_FLOOR_REFLECTOR,
  reflectorInnerRadius: 2.0,
  reflectorTint:       '#850f0f',
  reflectorLift:       0.001,
  reflectorBlur:       0.0055,        // crisp mirror by default

  // Roof planar reflector — same idea but flipped, with a touch of blur so
  // the ceiling reads as a softer mirror.
  roofReflectorEnabled:    ENABLE_ROOF_REFLECTOR,
  roofReflectorInnerRadius: 0,
  roofReflectorTint:       '#230505',
  roofReflectorLift:       0.008,  // offset DOWN from the ceiling underside
  roofReflectorBlur:       0.0075,

  // Logo glass/ice (MeshPhysicalMaterial transmission)
  logoGlassColor:        '#850f0f',  // base color of the glass
  logoGlassTint:         '#850f0f',  // attenuation tint inside the volume
  logoGlassTintDistance: 1.0,        // attenuation distance — smaller = more tint
  logoGlassIor:          2.5,       // ~1 = no refraction, 1.5 = glass, 2.4 = diamond
  logoGlassRoughness:    0.13,       // 0 = perfectly clear, 1 = fully diffuse
  logoGlassThickness:    0,        // volume thickness for refraction depth
  logoGlassTransmission: 1.0,        // 0 = opaque, 1 = fully see-through

  // Logo exit gradient (emissive) — the logo swaps to this while leaving, so it
  // stays visible diving into the unlit well below the ring. Vertical gradient.
  logoGradientTop:       '#6e0d0d',  // color at the top of the logo (darker)
  logoGradientBottom:    '#ff7a1f',  // color at the bottom (bright)
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
  logoExitFollowRate: 8,    // easing rate for the exit — also smooths the intro→scroll handoff
  logoContinueDrop:   7.5,  // beyond logoExitEnd the logo eases DOWN by this many units total and SETTLES (bounded — it does not keep falling out of view). This is a LONG descent so the camera (which follows ~cameraContinueFollow of it) travels deep past the floor/ceiling into empty black space. Bigger = deeper journey / floor leaves the frame sooner.
  logoSpinDeg:        1300,  // degrees the logo spins (like a top) per unit of scroll beyond logoExitEnd — a touch faster
  cameraFollowExit:   1.0,  // how much the camera height follows the exiting logo (0..1)
  cameraContinueFollow: 0.93, // in the empty space (continued descent past logoExitEnd) the camera follows this fraction of the logo's sink. High so the camera travels deep WITH the logo (surroundings leave the frame → pure black) while the small remainder (1 - this) × logoContinueDrop leaves the logo resting just BELOW frame centre. Higher → logo higher/more centred; lower → logo lower.
  logoExitMinScale:   0.3,  // the logo shrinks to this fraction of its rest size at the bottom of the continued descent (smaller when it's far down in the empty space)

  // Logo mouse parallax — very subtle, always active (does not wait for intro).
  logoParallaxAmp:  0.08, // max positional offset (world units); keep small
  logoParallaxRate: 8,    // easing rate toward the mouse target (higher = snappier)

  // Neon outline (OutlinePass)
  outlineEnabled:   true,
  outlineColor:     '#f95921',       // gradient top by default
  outlineStrength:  4.0,
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

  // Scene layout
  sceneZ:           -5,
  floorTargetY:     -1.4,
  floorRadius:      7,
  logoExtraScale:   1.0,

  // Floor "concrete" blackout — the view fades to black while the camera passes
  // down through the floor, then clears below it to reveal the logo. World Y,
  // relative to floorTargetY (the floor surface).
  blackoutEnabled:  true,
  blackoutFadeIn:   0.3,   // start darkening this far ABOVE the floor
  blackoutDepth:    0.5,   // stay fully black from the floor down to this depth
  blackoutFadeOut:  0.5,   // then fade back to clear over this further distance

  // Floor occluder — an opaque dark ring just under the floor reflector. The
  // reflector is a single-sided plane, so from below its backface is culled and
  // you see the videos "through" it. This ring backs it. It's only shown while
  // the camera is BELOW the floor (see animate) — otherwise, with the camera
  // above and the logo dipping below, it would also cover the logo.
  // Solid floor "concrete" occluder (disabled — using the blackout fade instead).
  occluderEnabled:     false,
  occluderColor:       '#010101',
  occluderInnerRadius: 2.0,
  occluderDepth:       1.0,

  floorMeshVisible:    true,

  // Well — the central pit the logo dives into. (Disabled: only useful with the
  // camera-dive-into-well behavior, which we're not using.)
  wellEnabled:     false,
  wellColor:       '#010101',
  wellRadius:      2.0,   // the well opening (≈ reflectorInnerRadius)
  wellDepth:       6.0,   // how deep the walls go
  wellShowMargin:  0.6,   // walls appear once the camera is within this of the well radius

  // Scroll-driven ring rotation (camera is fixed). DESKTOP values; mobile gets
  // its own tour timing in the IS_MOBILE override block below.
  ringStartRotationDeg: 50,    // base rotation at scroll=0 so the initial view is framed/centered
  scrollMaxRotationDeg: 150,   // extra rotation added over the full scroll — small turn, not a full spin
  scrollFollowRate:     6,     // higher = ring tracks scroll faster (less lag)

  // Hover mask on the video planes
  maskColor:       '#2e0000',
  maskBaseOpacity: 0.95,
  maskFadeRate:    16,
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
  ringIntensity:      20,
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
  params.ringMaxRotationDeg   = 145;  // clamp: hold on screen 3, below the 148° intrusion
  params.logoExitStart        = 0.5;  // delay the exit so all 3 screens are toured first
  params.logoExitEnd          = 0.68;
  // Descent: the portrait camera sits ~1.9× further back, so the same world-space
  // sink reads about half as deep on screen. Push the logo down further and let it
  // drift lower relative to the camera so it ends near the bottom edge (like
  // desktop) and the camera dives deep enough that the floor leaves the frame.
  params.logoContinueDrop     = 14;   // was 7.5 — deeper sink for the further camera
  params.cameraContinueFollow = 0.8;  // was 0.93 — logo sits lower in the frame
  // Spin: the final orientation is (1 − logoExitEnd) × logoSpinDeg. With mobile's
  // logoExitEnd (0.68) that span is 0.32, so 2250° lands on exactly 720° (2 full
  // turns) → the logo settles facing forward, same as its start (like desktop).
  params.logoSpinDeg          = 2250;
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


// ─── Logo glass / ice material (transmissive PBR) ───────────────────────────
// Built-in MeshPhysicalMaterial with transmission: light passes through the
// volume, refracts via IOR, blurs with roughness, and tints by attenuation.
// (Drei's MeshTransmissionMaterial adds chromatic aberration / anisotropy /
// noise flow on top of this — not included here.)
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color:               new THREE.Color(params.logoGlassColor),
  transmission:        params.logoGlassTransmission,
  ior:                 params.logoGlassIor,
  roughness:           params.logoGlassRoughness,
  thickness:           params.logoGlassThickness,
  attenuationColor:    new THREE.Color(params.logoGlassTint),
  attenuationDistance: params.logoGlassTintDistance,
  metalness:           0,
  side:                THREE.DoubleSide,
});

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
    uOpacity: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying float vY;
    void main() {
      vY = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uTop;
    uniform vec3 uBottom;
    uniform float uMinY;
    uniform float uMaxY;
    uniform float uOpacity;
    varying float vY;
    void main() {
      float t = clamp((vY - uMinY) / max(uMaxY - uMinY, 1e-4), 0.0, 1.0);
      gl_FragColor = vec4(mix(uBottom, uTop, t), uOpacity);
    }
  `,
  side:          THREE.DoubleSide,
  transparent:   true,
  depthWrite:    false,   // don't block; blends over the glass
  // The shell shares the glass mesh's exact geometry, so a plain polygonOffset
  // isn't enough on curved/grazing areas — the shell loses the depth test against
  // the coincident glass there and shows z-fighting stripes. Disable depthTest so
  // the shell always draws. Safe here: the gradient colour depends only on
  // position.y, so DoubleSide front/back faces paint identically (no ordering
  // artifact), and the shell is only visible (uOpacity>0) once the logo is alone
  // in the empty well with nothing in front of it.
  depthTest:     false,
});

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
// makeBlurredReflector returns a THREE.Reflector with its fragment shader
// patched to do a 5×5 multi-tap blur in projected UV space. blur === 0 keeps
// it crisp; ~0.01+ gives a frosted-mirror look.
function makeBlurredReflector(geom, tintHex, blur) {
  const r = new Reflector(geom, {
    clipBias:      0.003,
    // Reflectors render the whole scene to a texture every frame — the
    // biggest perf hit. Sub-resolution is invisible once blur is in the chain.
    textureWidth:  Math.floor(viewportW() * REFLECTOR_RT_SCALE),
    textureHeight: Math.floor(viewportH() * REFLECTOR_RT_SCALE),
    color:         new THREE.Color(tintHex),
  });
  r.material.uniforms.uBlur = { value: blur };
  // Three.js' stock Reflector overlay blend (preserves brightness so the
  // mirror reads as a true mirror) — but with an optional 5×5 box blur on
  // the reflection texture for the soft frosted-mirror look on the ceiling.
  r.material.fragmentShader = /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uBlur;
    varying vec4 vUv;
    #include <logdepthbuf_pars_fragment>
    float blendOverlay(float base, float blend) {
      return (base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend)));
    }
    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec2 baseUv = vUv.xy / vUv.w;
      vec3 sum = vec3(0.0);
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          vec2 off = vec2(float(x), float(y)) * uBlur;
          sum += texture2D(tDiffuse, baseUv + off).rgb;
        }
      }
      vec3 base = sum / 25.0;
      gl_FragColor = vec4(blendOverlay(base, color), 1.0);
    }
  `;
  r.material.needsUpdate = true;

  // Mobile: refresh the reflection only every other frame. Rendering the whole
  // scene into the mirror RT is the reflector's real cost; the blurred, slowly
  // moving reflection doesn't need a 60 Hz update, so skipping every second
  // frame roughly halves that cost. (Only the floor reflector exists on mobile.)
  if (IS_MOBILE) {
    const origOnBeforeRender = r.onBeforeRender;
    let reflFrame = 0;
    r.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      if ((reflFrame++ & 1) === 0) {
        origOnBeforeRender.call(this, renderer, scene, camera, geometry, material, group);
      }
    };
  }

  return r;
}

let floorReflector = null;
let roofReflector  = null;

function rebuildFloorReflector() {
  if (floorReflector) {
    scene.remove(floorReflector);
    floorReflector.geometry.dispose();
    if (floorReflector.material) floorReflector.material.dispose();
    floorReflector = null;
  }
  if (!params.reflectorEnabled) return;
  const inner = params.reflectorInnerRadius;
  const outer = params.floorRadius;
  if (outer <= inner) return;
  const geom = new THREE.RingGeometry(inner, outer, 96);
  floorReflector = makeBlurredReflector(geom, params.reflectorTint, params.reflectorBlur);
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
  roofReflector = makeBlurredReflector(geom, params.roofReflectorTint, params.roofReflectorBlur);
  // Face DOWN so it reflects everything below the ceiling.
  roofReflector.rotation.x = Math.PI / 2;
  scene.add(roofReflector);
  positionRoofReflector();
}

function positionFloorReflector() {
  if (!floorReflector) return;
  floorReflector.position.set(
    floorBase.x,
    params.floorTargetY + params.reflectorLift,
    floorBase.z,
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
    if (material) mesh.material = material;
    group.add(mesh);
    geom.computeBoundingBox();
    bbox.union(geom.boundingBox);
  }
  return bbox;
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
  scene.background.set(params.bg);
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
    yShift + logoYAdjust,
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
function updateFraming() {
  const a = viewportW() / viewportH();
  camera.aspect = a;
  camera.fov    = params.fov;
  const pull    = Math.max(1, params.framingRefAspect / a); // >1 only when narrower than ref
  const factor  = 1 + (pull - 1) * params.portraitFit;
  camDistanceEff = params.cameraDistance * factor;
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

  const logoBbox  = bakeIntoGroup(logoMeshes,  logoGroup,  glassMaterial);
  const floorBbox = bakeIntoGroup(floorMeshes, floorGroup, null);
  bakeIntoGroup(videoMeshes, videosGroup, null);

  // TEST: hide the floor dish (floorMeshes[0]) — the reflector mirror stays.
  if (!params.floorMeshVisible && floorMeshes[0]) floorMeshes[0].visible = false;

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
      m.add(mask);
      m.userData.maskMesh = mask;
      m.userData.hovered  = false;
    });
  }

  if (!logoBbox.isEmpty()) {
    layout.logoBboxMinY = logoBbox.min.y;
    // Feed the logo's local Y bounds to the exit gradient shader.
    gradientMaterial.uniforms.uMinY.value = logoBbox.min.y;
    gradientMaterial.uniforms.uMaxY.value = logoBbox.max.y;
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
  rebuildFloorReflector();
  rebuildRoofReflector();
  rebuildFloorOccluder();
  rebuildWell();
  outlinePass.selectedObjects = logoGroup.children.slice();

  // Gradient "shells": one per logo mesh, same geometry, coincident with the
  // glass. They ride along inside logoGroup and crossfade in (uOpacity) as the
  // logo exits, giving a smooth glass→gradient transition with no hard swap.
  // Added AFTER selectedObjects so the outline stays keyed to the glass only.
  layout.logoGradientMeshes = layout.logoMeshes.map((m) => {
    const shell = new THREE.Mesh(m.geometry, gradientMaterial);
    shell.renderOrder = 1;   // draw over the glass during the crossfade
    logoGroup.add(shell);
    return shell;
  });

  // Hide the logo offscreen until the intro plays so the loader doesn't
  // flash a static logo for a frame before the rise animation kicks in.
  logoGroup.position.y = logoBase.y - params.logoAnimRise;
  glassMaterial.transparent = true;
  glassMaterial.opacity     = 0;

  loadingState.glb = true;
  loadingState.videos = TEST_VIDEOS.map(() => false);
  attachVideos(TEST_VIDEOS).then((results) => {
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
let logoParallaxX  = 0;   // damped mouse-parallax offset (always active)
let logoParallaxY  = 0;
let logoExitDamped = 0;   // damped scroll-exit amount — smooths the intro→scroll handoff
let logoContinuedDamped = 0;  // damped extra descent beyond the exit (logo keeps going down)
let logoSpinAngle       = 0;  // damped spin (like a top) after the gradient transition
let logoBaseScale       = 1;  // logoGroup scale at rest (glbScale * logoExtraScale); shrunk during the descent

// The tall scroll track. In Webflow it's the #cc-hero section (the sticky child
// #cc-sticky pins while the page scrolls through it); locally it's absent and we
// fall back to whole-page scroll driven by #scroll-spacer.
const scrollTrackEl = document.getElementById('cc-hero');
function updateScrollProgress() {
  if (scrollTrackEl) {
    // Section-relative progress: 0 when the section top reaches the viewport top,
    // 1 when its bottom reaches the viewport bottom (i.e. the sticky child has
    // traveled its full range and is about to unpin). Independent of anything
    // else on the page, so the hero works as one section among many.
    const rect = scrollTrackEl.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    scrollProgress = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0;
  } else {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }
}
window.addEventListener('scroll', updateScrollProgress, { passive: true });
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

// (Comet trail removed — no longer used on desktop or mobile.)
// (Camera orbit dial removed — the camera is fixed now; scroll drives the ring.)

// ─── Resize ──────────────────────────────────────────────────────────────────
function onResize() {
  const w = viewportW(), h = viewportH();
  updateFraming();  // aspect + responsive pull-back for portrait/tablet
  renderer.setSize(w, h, false);   // updateStyle=false — CSS keeps the canvas at 100% of #app
  composer.setSize(w, h);
  outlinePass.setSize(w, h);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
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

function attachVideo(index, url) {
  return new Promise((resolve) => {
    const mesh = layout.videoMeshes[index];
    if (!mesh) { console.warn('attachVideo: no plane at index', index); resolve(false); return; }

    const video = document.createElement('video');
    // crossOrigin must be set BEFORE src so the canvas isn't tainted later.
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.src = url;

    const label = `[plane ${index} ← ${url}]`;
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };

    video.addEventListener('loadeddata', () => {
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // GLB plane UVs expect non-flipped video

      // Cover-fit: fill the screen and crop the excess instead of stretching the
      // video. Compares the video's aspect to the screen's and zooms the texture.
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
      video.play().catch((e) => console.warn(`${label} play() rejected:`, e));
      finish(true);
    });
    video.addEventListener('error', () => {
      const err = video.error;
      console.warn(
        `${label} FAILED — code ${err?.code} (${err?.message || 'unknown'}). ` +
        `Most likely the browser can't decode this .mkv codec. Convert to .mp4 (H.264).`
      );
      finish(false);
    });
    video.addEventListener('stalled', () => console.warn(`${label} stalled`));
  });
}

function attachVideos(urls) {
  return Promise.all(urls.map((u, i) => attachVideo(i, u)));
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
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
const lookTarget    = new THREE.Vector3();
const _maskColor    = new THREE.Color();
const _blendedLight = new THREE.Color();

function animate() {
  requestAnimationFrame(animate);
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

  // Mouse parallax runs constantly (does not wait for the intro) — very subtle.
  // ndcMouse is kept up to date by the pointermove handler.
  logoParallaxX = damp(logoParallaxX, ndcMouse.x * params.logoParallaxAmp, params.logoParallaxRate, dt);
  logoParallaxY = damp(logoParallaxY, ndcMouse.y * params.logoParallaxAmp, params.logoParallaxRate, dt);

  // Camera stays fixed in its horizontal position; only its HEIGHT follows the
  // logo, and it keeps looking LEVEL (constant pitch) — it does NOT tilt to chase
  // the logo. It tracks the transition drop 1:1 (blackout works), but in the
  // empty space follows only cameraContinueFollow of the continued sink. Both the
  // look target and the camera move by the same amount, so the logo — which sinks
  // the full distance — drifts DOWN toward the bottom of the frame. The logo
  // shrinks as it goes (see below), so it stays in view instead of exiting.
  const restLookY = logoBase.y + params.lookOffsetY;
  const followY   = (transitionOffsetY - logoContinuedDamped * params.cameraContinueFollow) * params.cameraFollowExit;
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

  if (logoAnim.phase === 'run') {
    // Vertical = rise offset (intro) + exit offset (scroll), both continuous.
    const riseOffsetY = -(1 - introEased) * params.logoAnimRise;
    logoAnim.currentY = logoBase.y + riseOffsetY + logoExitOffsetY;
    logoGroup.position.set(
      logoBase.x + logoParallaxX,
      logoAnim.currentY + logoParallaxY,
      logoBase.z,
    );
    // Spin like a top around Y (gentle, one direction) once past the exit — this
    // kicks in right as the gradient transition finishes.
    logoGroup.rotation.y = params.logoRotationY * DEG_TO_RAD + logoSpinAngle;
    // Shrink the logo as it sinks into the empty space — smaller the further it
    // goes down. Normalised against the continued descent → eases to
    // logoExitMinScale at full scroll. Uses the damped descent value → smooth.
    const shrinkT = params.logoContinueDrop > 0
      ? Math.min(1, logoContinuedDamped / params.logoContinueDrop)
      : 0;
    const logoScale = logoBaseScale * (1 - shrinkT * (1 - params.logoExitMinScale));
    logoGroup.scale.setScalar(logoScale);
    // Glass fades in during the intro; the gradient shell crossfades in over it
    // as the logo exits, but only AFTER logoGradientStart (so it kicks in once
    // the camera is down in the floor, not the moment the exit begins). Remap
    // exitEased into [logoGradientStart..1] → [0..1]. The neon outline fades out
    // as the gradient takes over, leaving the pure gradient shape.
    const gStart = params.logoGradientStart;
    const gradT = gStart < 1
      ? Math.min(1, Math.max(0, (exitEased - gStart) / (1 - gStart)))
      : (exitEased > 0 ? 1 : 0);
    // True crossfade: fade the GLASS OUT (opacity + transmission) as the gradient
    // fades IN. This is essential because a transmissive MeshPhysicalMaterial is
    // drawn in a SEPARATE, LAST render pass — it always draws on top of the
    // transparent gradient shell regardless of renderOrder, so leaving the glass
    // fully opaque made it fight/flicker over the gradient during the transition.
    // Driving transmission → 0 also drops the glass out of that transmission pass
    // by the time the gradient is full, so nothing renders over the gradient.
    glassMaterial.opacity      = introEased * (1 - gradT);
    glassMaterial.transmission = params.logoGlassTransmission * (1 - gradT);
    gradientMaterial.uniforms.uOpacity.value = gradT;
    outlinePass.edgeStrength = params.outlineStrength * outlineRamp * (1 - gradT);
    if (logoSpot) logoSpot.intensity = params.ringIntensity * spotEased;
  }

  composer.render();
}
animate();
