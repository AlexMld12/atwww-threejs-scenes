import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// ─── Webflow mount + scroll track ─────────────────────────────────────────────
// The canvas mounts into #footer-canvas (local scaffold) or the Webflow sticky
// child (.footer-sticky). The tall .footer-universe section provides the scroll
// range that drives the camera reveal; when absent we fall back to page scroll.
const mountEl = document.getElementById('footer-canvas')
  || document.querySelector('.footer-sticky')
  || document.querySelector('.footer-universe')
  || document.getElementById('app')
  || document.body;
const scrollSection = document.querySelector('.footer-universe');

// Asset base for the GLB. Locally / on GitHub Pages the relative path resolves
// against the page; embedded on Webflow it must point at the CDN folder that
// holds the .glb, so Webflow sets `window.FOOTER_ASSET_BASE` (e.g. a jsDelivr
// URL, CORS-enabled). Same convention as command-center-slider's CC_ASSET_BASE.
const ASSET_BASE = (typeof window !== 'undefined' && window.FOOTER_ASSET_BASE)
  || import.meta.env.BASE_URL;

// ─── Device tier ──────────────────────────────────────────────────────────────
// Most phones lack EXT_disjoint_timer_query_webgl2 (iOS Safari never shipped it;
// many Android browsers disable it), so the GPU-timed adaptive controller further
// down can't measure them and leaves renderScale pinned at 1.0 — i.e. the FULL
// pipeline at full DPR on exactly the weakest GPUs. The fix is to not depend on an
// adaptation that never runs there: detect a low-power tier up front from device
// signals and pre-bias the heavy knobs (DPR cap, MSAA, blur taps, reflector RT,
// half-rate cadence) so mobile starts cheap. Desktop keeps every value it had, so
// its output stays byte-identical.
const IS_MOBILE = !!(
  (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
  || Math.min(window.innerWidth, window.innerHeight) < 700
  || (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4)
);
const TIER = {
  dprCap:       IS_MOBILE ? 1.25 : 1.75,  // fill-rate is the bottleneck; the single biggest lever
  msaaSamples:  IS_MOBILE ? 2    : 4,     // 4× MSAA on a HalfFloat RT is heavy bandwidth on mobile
  reflectorMax: IS_MOBILE ? 512  : 1024,  // mirror RT resolution cap
  reflectEvery: IS_MOBILE ? 3    : 2,     // half-rate cadence for the mirror re-render
  glassEvery:   IS_MOBILE ? 3    : 2,     // half-rate cadence for the glass sceneRT capture
  blurTaps:     IS_MOBILE ? 1    : 2,     // radius of the NxN blur loops (1 → 3×3, 2 → 5×5)
};

// ─── Renderer + scene ────────────────────────────────────────────────────────
// antialias:false — every draw lands in composerRT (samples:4 desktop / 2 mobile,
// HalfFloat) and OutputPass blits the resolved result to the default framebuffer
// as a single fullscreen quad, so the renderer's own MSAA would only anti-alias
// that quad's edges (i.e. nothing). Dropping it removes a redundant resolve.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// Cap DPR below the device max (TIER.dprCap) — keeps the heavy postpro pipeline
// (planar reflection + sceneRT + composer) within budget on retina/mobile.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TIER.dprCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
mountEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
scene.add(new THREE.AmbientLight(0xffffff, 0.18));

// ─── Config ──────────────────────────────────────────────────────────────────
// Auto-scale particle count by viewport area + DPR. A 1920×1080 desktop hits
// the default 350; a phone at 390×844 lands around 70.
const VIEWPORT_FACTOR = Math.min(1,
  (window.innerWidth * window.innerHeight) / (1920 * 1080));

const params = {
  fov: 55,
  posX: 0, posY: 0, posZ: 3,
  lookX: 0, lookY: -0.5, lookZ: -5,
  camPitchDeg: 0, camYawDeg: 0, camRollDeg: -12,

  // Scroll-driven camera reveal. scroll 0 → the camera sits high above the logo,
  // centred over the stack and looking down at the whole scene; scroll 1 → it
  // eases into the resting front view (pos*/look*/camRollDeg above), which is
  // the original framing. Only the camera moves — the scene itself is untouched.
  // (The scene is centred at x≈0, z≈sceneZ; floor at floorTargetY, rings stacked
  //  above it — so the start look-at targets that column from overhead.)
  scrollCam:        true,
  camStartPosX:     0,
  camStartPosY:     18,     // high above the stack — far enough to read as an overhead shot, not a close-up
  camStartPosZ:     -3.5,   // slightly toward the viewer so the down-look isn't a degenerate straight-down
  camStartLookX:    0,
  camStartLookY:    -1.4,   // ≈ floorTargetY — aim at the base of the stack
  camStartLookZ:    -5,     // ≈ sceneZ
  camStartRollDeg:  0,
  camStartFov:      60,     // a touch wider up top to fit the whole spread of rings
  scrollCamEase:    1.0,    // 0 = linear, 1 = full smoothstep on the reveal

  sceneZ:         -5,
  floorTargetY:   -1.4,
  floorRadius:    7,
  logoExtraScale: 2,
  logoYawDeg:     -90,

  // Stadium-shaped neon rings stacked above the logo. tiltSpeed/tiltAmp drive
  // an animated sine pitch per ring (each with a random phase) so the rings
  // continually criss-cross instead of reading as parallel sheets.
  stackedRings: [
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 1.00, tiltSpeed: 1.00, tiltAmp: 0.5, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 1.40, tiltSpeed: 0.55, tiltAmp: 1.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 1.80, tiltSpeed: 0.20, tiltAmp: 0.5, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 2.20, tiltSpeed: 0.70, tiltAmp: 2.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 2.60, tiltSpeed: 0.40, tiltAmp: 1.0, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 2.80, tiltSpeed: 0.25, tiltAmp: 4.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 3.20, tiltSpeed: 0.60, tiltAmp: 1.0, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 3.45, tiltSpeed: 0.35, tiltAmp: 0.5, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 3.60, tiltSpeed: 0.80, tiltAmp: 2.0, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 4.00, tiltSpeed: 0.30, tiltAmp: 1.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 4.20, tiltSpeed: 0.50, tiltAmp: 2.0, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 4.60, tiltSpeed: 0.22, tiltAmp: 4.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 4.80, tiltSpeed: 0.65, tiltAmp: 0.5, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 5.20, tiltSpeed: 0.45, tiltAmp: 0.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 5.50, tiltSpeed: 0.28, tiltAmp: 1.0, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 5.80, tiltSpeed: 0.52, tiltAmp: 2.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 6.10, tiltSpeed: 0.33, tiltAmp: 1.0, color: '#f95921' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 6.40, tiltSpeed: 0.72, tiltAmp: 3.0, color: '#ffc34b' },
    { width: 30, depth: 14, tubeRadius: 0.005, lift: 6.80, tiltSpeed: 0.18, tiltAmp: 0.5, color: '#f95921' },
  ],
  stackedRingsYawDeg: 90,

  // Floor: black PBR cylinders sample a hidden planar Reflector's RT for the
  // mirrored ring reflection. Radial UV distortion + a soft grain + a fade
  // toward the floor edge keep it from reading as a perfect mirror.
  floorReflectionIntensity:  0.5,
  floorReflectionBlur:       2,
  floorReflectionFade:       0.69,
  floorReflectionDistortion: -2,
  floorNoiseStrength:        0.25,
  floorBaseColor:            '#000000',
  floorRoughness:            1,
  floorMetalness:            1,

  outlineColor:    '#ffc34b',
  outlineStrength: 4.0,
  outlineGlow:     0.8,
  outlineThickness: 1.0,

  // Logo body — screen-space refraction glass (transmission-style):
  // sceneRT capture + IOR-based UV bend + anisotropic blur + chromatic split.
  logoGlassTint:        '#ffffff',
  logoGlassTintAmount:  0.08,
  logoGlassIor:         1.0,
  logoGlassDistortion:  0.025,
  logoGlassNoiseScale:  3.0,
  logoGlassBlur:        5.0,
  logoGlassAnisoBlur:   16.0,
  logoGlassAnisoAngle:  0.0,
  logoGlassChroma:      0.012,
  logoGlassFresnel:     0.0,
  logoGlassFlow:        0.15,

  bloomStrength:  0.3,
  bloomRadius:    0.8,
  bloomThreshold: 0.4,

  // Per-ring sweep — randomised multipliers baked at build, these are the
  // base values they multiply against.
  neonBaseIntensity: 0.2,
  neonPeakBoost:     5.0,
  neonArcWidth:      0.2,
  neonSpeedMin:      0.8,
  neonSpeedMax:      2.6,
  neonPulseRateMin:  1.8,
  neonPulseRateMax:  4.5,
  neonPulseDepth:    0.95,

  // Mouse parallax on the logo.
  parallaxRotX:       0.18,
  parallaxRotY:       0.45,
  parallaxRotZ:       0.05,
  parallaxPos:        0.08,
  parallaxSmoothRate: 6,

  // Fire particles — additive Points cloud streaming toward the camera.
  particleCount:     Math.round(THREE.MathUtils.clamp(350 * VIEWPORT_FACTOR, 80, 500)),
  particleSpeed:     14,
  particleSize:      0.12,
  particleSpreadX:   38,
  particleSpreadY:   12,
  particleYBase:     1.5,
  particleSpawnZ:    -45,
  particleColorHot:  '#fff0d0',
  particleColorMid:  '#ffc34b',
  particleColorBot:  '#f95921',
  particleBrightness: 2.2,
};

// ─── Postprocessing ──────────────────────────────────────────────────────────
// Custom RT with MSAA so the bright thin tubes don't staircase, + HalfFloat
// so the bloom pass has headroom for the HDR neon highlights.
const pr = renderer.getPixelRatio();
const composerRT = new THREE.WebGLRenderTarget(
  window.innerWidth  * pr,
  window.innerHeight * pr,
  { type: THREE.HalfFloatType, samples: TIER.msaaSamples },
);
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));

const outlinePass = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera,
);
outlinePass.edgeStrength  = params.outlineStrength;
outlinePass.edgeGlow      = params.outlineGlow;
outlinePass.edgeThickness = params.outlineThickness;
outlinePass.visibleEdgeColor.set(params.outlineColor);
outlinePass.hiddenEdgeColor.set(params.outlineColor);
composer.addPass(outlinePass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  params.bloomStrength, params.bloomRadius, params.bloomThreshold,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// sceneRT — captured each frame with the logo / floor / pedestal hidden.
// The logo's glass shader samples this to refract everything behind it.
const sceneRT = new THREE.WebGLRenderTarget(
  Math.floor(window.innerWidth  * pr),
  Math.floor(window.innerHeight * pr),
  { type: THREE.HalfFloatType },
);

// ─── Groups ──────────────────────────────────────────────────────────────────
const logoGroup         = new THREE.Group();
const floorGroup        = new THREE.Group();
const pedestalGroup     = new THREE.Group();
const stackedRingsGroup = new THREE.Group();
scene.add(logoGroup, floorGroup, pedestalGroup, stackedRingsGroup);

const logoBase  = new THREE.Vector3();
const floorBase = new THREE.Vector3();
const stackedRingMeshes = [];

// ─── Half-rate cadence for the redundant full-scene passes ───────────────────
// The per-frame pipeline does three full-scene renders: the glass sceneRT
// capture, the hidden Reflector's mirror re-render, and the composer RenderPass.
// The first two feed blurred/mirrored textures where a 30fps refresh is visually
// imperceptible, so we re-render each every OTHER frame and reuse its previous
// texture on skipped frames (the RT is never cleared or hidden — only the
// re-render is gated). Each RT is guaranteed to render on the first frame before
// it is ever displayed (glassCaptured / reflectorRendered guards), so there is
// no first-frame flicker. Tune via the *_EVERY constants (1 = every frame).
const REFLECTION_EVERY     = TIER.reflectEvery;
const GLASS_CAPTURE_EVERY  = TIER.glassEvery;
let frameCount        = 0;
let glassCaptured     = false;
let reflectorRendered = false;

// ─── Reflector (hidden — used only for its RT) ───────────────────────────────
// CircleGeometry sized to the floor footprint. material.colorWrite/depthWrite
// off means it contributes no pixels visually, but its onBeforeRender still
// fires each frame and renders the scene from the mirrored virtual camera.
const reflectorRTSize = Math.min(TIER.reflectorMax, Math.floor(window.innerWidth * pr));
const reflector = new Reflector(
  new THREE.CircleGeometry(params.floorRadius, 96),
  {
    clipBias: 0.003,
    textureWidth:  reflectorRTSize,
    textureHeight: reflectorRTSize,
    color: new THREE.Color(0xffffff),
  },
);
reflector.rotation.x = -Math.PI / 2;
reflector.position.y = params.floorTargetY;
reflector.material.colorWrite = false;
reflector.material.depthWrite = false;
scene.add(reflector);

// Hide logo + floor + pedestal during the reflector RT capture so the
// reflection only contains the rings + particles above the floor.
const _reflectorBefore = reflector.onBeforeRender.bind(reflector);
reflector.onBeforeRender = function (r, s, c) {
  // Skip during OutlinePass override passes (depth/mask): that pass re-renders the
  // scene with an override material INTO the reflection RT as the frame's LAST
  // write, so a skipped half-rate frame would then reuse depth garbage → a strobe.
  // Only the real color RenderPass (no overrideMaterial) may write the RT.
  if (s.overrideMaterial) return;
  // Half-rate the mirror re-render (technique 3): on skipped frames we return
  // before _reflectorBefore, so the Reflector keeps its previous RT texture and
  // textureMatrix — the floor shader samples the last mirror, one frame stale
  // and imperceptible. Always render the first frame (reflectorRendered guard)
  // so the RT is initialised before it is ever displayed.
  if (reflectorRendered && (frameCount % REFLECTION_EVERY) !== 0) return;
  const wasLogo = logoGroup.visible, wasFloor = floorGroup.visible, wasPed = pedestalGroup.visible;
  logoGroup.visible = floorGroup.visible = pedestalGroup.visible = false;
  _reflectorBefore(r, s, c);
  logoGroup.visible = wasLogo; floorGroup.visible = wasFloor; pedestalGroup.visible = wasPed;
  reflectorRendered = true;
};

// ─── Logo material (screen-space refraction glass) ───────────────────────────
const logoFillMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tScene:      { value: sceneRT.texture },
    uResolution: { value: new THREE.Vector2(sceneRT.width, sceneRT.height) },
    uTime:       { value: 0 },
    uTint:       { value: new THREE.Color(params.logoGlassTint) },
    uTintAmount: { value: params.logoGlassTintAmount },
    uIor:        { value: params.logoGlassIor },
    uDistortion: { value: params.logoGlassDistortion },
    uNoiseScale: { value: params.logoGlassNoiseScale },
    uBlur:       { value: params.logoGlassBlur },
    uAnisoBlur:  { value: params.logoGlassAnisoBlur },
    uAnisoAngle: { value: params.logoGlassAnisoAngle * Math.PI / 180 },
    uChroma:     { value: params.logoGlassChroma },
    uFresnel:    { value: params.logoGlassFresnel },
    uFlow:       { value: params.logoGlassFlow },
  },
  vertexShader: /* glsl */`
    varying vec3 vViewNormal;
    varying vec3 vWorldPos;
    varying vec4 vClip;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos   = wp.xyz;
      vViewNormal = normalize(normalMatrix * normal);
      vClip = projectionMatrix * viewMatrix * wp;
      gl_Position = vClip;
    }
  `,
  fragmentShader: /* glsl */`
    #define BLUR_R ${TIER.blurTaps}
    uniform sampler2D tScene;
    uniform vec2  uResolution;
    uniform float uTime, uTintAmount, uIor, uDistortion, uNoiseScale;
    uniform float uBlur, uAnisoBlur, uAnisoAngle, uChroma, uFresnel, uFlow;
    uniform vec3  uTint;
    varying vec3 vViewNormal;
    varying vec3 vWorldPos;
    varying vec4 vClip;

    float gHash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1); p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float gNoise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(gHash(i), gHash(i+vec3(1,0,0)), f.x),
            mix(gHash(i+vec3(0,1,0)), gHash(i+vec3(1,1,0)), f.x), f.y),
        mix(mix(gHash(i+vec3(0,0,1)), gHash(i+vec3(1,0,1)), f.x),
            mix(gHash(i+vec3(0,1,1)), gHash(i+vec3(1,1,1)), f.x), f.y), f.z);
    }
    float gFbm(vec3 p) {
      float v = 0.0, a = 0.5;
      for (int k = 0; k < 3; k++) { v += a * gNoise(p); p *= 2.07; a *= 0.55; }
      return v;
    }

    void main() {
      vec2 uv = (vClip.xy / vClip.w) * 0.5 + 0.5;
      vec2 refr = vViewNormal.xy * uIor;
      vec3 np = vWorldPos * uNoiseScale + vec3(0.0, 0.0, uTime * uFlow);
      float nx = gFbm(np) - 0.5;
      float ny = gFbm(np + vec3(11.3, 7.1, 3.7)) - 0.5;
      vec2 baseUV = uv + refr + vec2(nx, ny) * uDistortion;

      vec2 aDir  = vec2(cos(uAnisoAngle), sin(uAnisoAngle));
      vec2 aPerp = vec2(-aDir.y, aDir.x);
      vec2 chroma = vViewNormal.xy * uChroma;

      vec3 col = vec3(0.0);
      float wsum = 0.0;
      for (int j = -BLUR_R; j <= BLUR_R; j++) {
        for (int i = -BLUR_R; i <= BLUR_R; i++) {
          vec2 off = (aDir * float(i) * (uBlur + uAnisoBlur)
                    + aPerp * float(j) *  uBlur) / uResolution;
          float w = exp(-float(i*i + j*j) * 0.4);
          vec2 suv = baseUV + off;
          col.r += texture2D(tScene, suv + chroma).r * w;
          col.g += texture2D(tScene, suv).g          * w;
          col.b += texture2D(tScene, suv - chroma).b * w;
          wsum  += w;
        }
      }
      col /= wsum;
      col = mix(col, col * uTint, uTintAmount);
      float fres = pow(1.0 - abs(vViewNormal.z), 3.0);
      col += fres * uFresnel;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.FrontSide,
  depthWrite: true,
  depthTest:  true,
});

// ─── Neon ring material (animated sweep around the loop) ─────────────────────
function makeRingAnim(extra = {}) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const speed = THREE.MathUtils.lerp(params.neonSpeedMin, params.neonSpeedMax, Math.random()) * dir;
  const pulseRate = THREE.MathUtils.lerp(params.neonPulseRateMin, params.neonPulseRateMax, Math.random());
  return {
    phase:            Math.random() * Math.PI * 2,
    speed,
    arcWidthMul:      0.6 + Math.random() * 0.8,
    baseIntensityMul: 0.6 + Math.random() * 0.6,
    peakBoostMul:     0.6 + Math.random() * 0.8,
    pulseRate,
    pulseDepthMul:    0.4 + Math.random(),
    pulsePhase:       Math.random() * Math.PI * 2,
    ...extra,
  };
}

function makeNeonRingMaterial(colorHex, anim, { useArcParam = false } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, side: THREE.DoubleSide });
  const uniforms = {
    uTime:          { value: 0 },
    uPhase:         { value: anim.phase },
    uSpeed:         { value: anim.speed },
    uArcWidth:      { value: params.neonArcWidth      * anim.arcWidthMul },
    uBaseIntensity: { value: params.neonBaseIntensity * anim.baseIntensityMul },
    uPeakBoost:     { value: params.neonPeakBoost     * anim.peakBoostMul },
    uPulseRate:     { value: anim.pulseRate },
    uPulseDepth:    { value: params.neonPulseDepth    * anim.pulseDepthMul },
    uPulsePhase:    { value: anim.pulsePhase },
  };
  mat.userData.neon = uniforms;
  mat.userData.anim = anim;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // useArcParam=true → stadium tubes use a per-vertex 0..1 arc-length attr
    // so the head sweeps at constant speed despite a non-uniform cross-section.
    // useArcParam=false → cylinders use atan(z,x) on the local position.
    if (useArcParam) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',     '#include <common>\nattribute float aArcParam;\nvarying float vArcAngle;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvArcAngle = aArcParam * 6.28318530718;');
    } else {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',     '#include <common>\nvarying float vArcAngle;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvArcAngle = atan(position.z, position.x);');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>
         #define TAU 6.28318530718
         varying float vArcAngle;
         uniform float uTime, uPhase, uSpeed, uArcWidth;
         uniform float uBaseIntensity, uPeakBoost, uPulseRate, uPulseDepth, uPulsePhase;`)
      .replace('#include <color_fragment>',
        `#include <color_fragment>
         float head  = mod(uTime * uSpeed + uPhase, TAU);
         float d     = mod(vArcAngle - head, TAU);
         float trail = exp(-d / max(uArcWidth, 0.001));
         float pulse = 1.0 + sin(uTime * uPulseRate + uPulsePhase) * uPulseDepth;
         diffuseColor.rgb *= uBaseIntensity + uPeakBoost * trail * pulse;`);
  };
  return mat;
}

// ─── Floor cylinder material (planar reflection sampler) ─────────────────────
// MeshStandardMaterial whose emissive channel adds a perspective-correct
// reflection sampled from the hidden Reflector's RT — distorted radially
// outward, blurred, faded near the floor edge, and modulated by a noise grain.
const floorReflMats = [];
function makeFloorCylinderMaterial(colorHex) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    metalness: params.floorMetalness,
    roughness: params.floorRoughness,
    envMapIntensity: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    const rt = reflector.getRenderTarget();
    shader.uniforms.tReflection           = { value: rt.texture };
    shader.uniforms.uTextureMatrix        = reflector.material.uniforms.textureMatrix;
    shader.uniforms.uReflectionStrength   = { value: params.floorReflectionIntensity };
    shader.uniforms.uReflectionFade       = { value: params.floorReflectionFade };
    shader.uniforms.uReflectionBlur       = { value: params.floorReflectionBlur };
    shader.uniforms.uReflectionDistortion = { value: params.floorReflectionDistortion };
    shader.uniforms.uNoiseStrength        = { value: params.floorNoiseStrength };
    shader.uniforms.uFloorRadius          = { value: params.floorRadius };
    shader.uniforms.uFloorCenter          = { value: new THREE.Vector2(0, params.sceneZ) };
    shader.uniforms.uBaseColor            = { value: new THREE.Color(params.floorBaseColor) };
    shader.uniforms.uReflTexSize          = { value: new THREE.Vector2(rt.width, rt.height) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        `#include <common>
         uniform mat4 uTextureMatrix;
         varying vec4 vReflCoord;
         varying vec3 vWorldXYZ;`)
      .replace('#include <project_vertex>',
        `vec4 _world = modelMatrix * vec4(transformed, 1.0);
         vWorldXYZ   = _world.xyz;
         vReflCoord  = uTextureMatrix * _world;
         #include <project_vertex>`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>
         #define BLUR_R ${TIER.blurTaps}
         uniform sampler2D tReflection;
         uniform float uReflectionStrength, uReflectionFade, uReflectionBlur, uReflectionDistortion;
         uniform vec2  uReflTexSize, uFloorCenter;
         uniform float uNoiseStrength, uFloorRadius;
         uniform vec3  uBaseColor;
         varying vec4  vReflCoord;
         varying vec3  vWorldXYZ;
         float fHash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
         float fVN(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(mix(fHash21(i),              fHash21(i+vec2(1,0)), f.x),
                      mix(fHash21(i+vec2(0,1)),    fHash21(i+vec2(1,1)), f.x), f.y);
         }`)
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         vec2  floorXZ = vWorldXYZ.xz - uFloorCenter;
         float floorR  = length(floorXZ) / max(uFloorRadius, 0.001);
         vec2  floorDir = floorR > 0.0001 ? floorXZ / (floorR * uFloorRadius) : vec2(0.0);
         vec2  reflUV   = vReflCoord.xy / vReflCoord.w;
         reflUV += floorDir * uReflectionDistortion * pow(floorR, 1.3) * 0.18;
         vec2 texel = uReflectionBlur / uReflTexSize;
         vec3 reflAcc = vec3(0.0); float wsum = 0.0;
         for (int dy = -BLUR_R; dy <= BLUR_R; dy++) {
           for (int dx = -BLUR_R; dx <= BLUR_R; dx++) {
             vec2 off = vec2(float(dx), float(dy)) * texel;
             float wt = exp(-float(dx*dx + dy*dy) * 0.35);
             reflAcc += texture2D(tReflection, reflUV + off).rgb * wt;
             wsum    += wt;
           }
         }
         vec3 reflRaw = reflAcc / max(wsum, 0.0001);
         float fade   = 1.0 - smoothstep(1.0 - uReflectionFade, 1.0 + 0.2, floorR);
         float n      = fVN(vWorldXYZ.xz * 8.0) * 0.6 + fVN(vWorldXYZ.xz * 24.0) * 0.4;
         float grain  = mix(1.0, n, uNoiseStrength);
         diffuseColor.rgb = mix(uBaseColor, diffuseColor.rgb, 0.5);
         totalEmissiveRadiance += reflRaw * uReflectionStrength * fade * grain;`);
    mat.userData.reflShader = shader;
  };
  floorReflMats.push(mat);
  return mat;
}

// ─── Stadium curve (rectangle + semicircular caps) ───────────────────────────
class StadiumCurve extends THREE.Curve {
  constructor(width, depth) {
    super();
    this.r = depth / 2;
    this.halfStraight = Math.max(0, (width - depth) / 2);
    this.semiLen     = Math.PI * this.r;
    this.straightLen = 2 * this.halfStraight;
    this.perimeter   = 2 * this.semiLen + 2 * this.straightLen;
  }
  getPoint(t, target = new THREE.Vector3()) {
    let s = t * this.perimeter;
    if (s < this.semiLen) {
      const a = -Math.PI / 2 + (s / this.semiLen) * Math.PI;
      return target.set(this.halfStraight + this.r * Math.cos(a), 0, this.r * Math.sin(a));
    }
    s -= this.semiLen;
    if (s < this.straightLen) {
      const u = s / this.straightLen;
      return target.set(this.halfStraight - u * 2 * this.halfStraight, 0, this.r);
    }
    s -= this.straightLen;
    if (s < this.semiLen) {
      const a = Math.PI / 2 + (s / this.semiLen) * Math.PI;
      return target.set(-this.halfStraight + this.r * Math.cos(a), 0, this.r * Math.sin(a));
    }
    s -= this.semiLen;
    const u = s / this.straightLen;
    return target.set(-this.halfStraight + u * 2 * this.halfStraight, 0, -this.r);
  }
}

function buildStackedRings() {
  for (const m of stackedRingsGroup.children.slice()) {
    stackedRingsGroup.remove(m);
    m.geometry.dispose(); m.material.dispose();
  }
  stackedRingMeshes.length = 0;

  const tubularSegments = 320, radialSegments = 12;
  for (const spec of params.stackedRings) {
    const geom = new THREE.TubeGeometry(
      new StadiumCurve(spec.width, spec.depth),
      tubularSegments, spec.tubeRadius, radialSegments, true,
    );
    const total = (tubularSegments + 1) * (radialSegments + 1);
    const arc = new Float32Array(total);
    for (let i = 0; i < total; i++) arc[i] = Math.floor(i / (radialSegments + 1)) / tubularSegments;
    geom.setAttribute('aArcParam', new THREE.BufferAttribute(arc, 1));

    const mesh = new THREE.Mesh(geom, makeNeonRingMaterial(spec.color, makeRingAnim(), { useArcParam: true }));
    mesh.userData.spec      = spec;
    mesh.userData.tiltPhase = Math.random() * Math.PI * 2;
    stackedRingsGroup.add(mesh);
    stackedRingMeshes.push(mesh);
  }
  positionStackedRings();
}

function positionStackedRings() {
  if (layout.ready) stackedRingsGroup.position.set(floorBase.x, params.floorTargetY, floorBase.z);
  else              stackedRingsGroup.position.set(0,           params.floorTargetY, params.sceneZ);
  for (const m of stackedRingMeshes) m.position.y = m.userData.spec.lift;
}

// ─── Fire particles ──────────────────────────────────────────────────────────
let particleSpeeds;

const particleMat = new THREE.ShaderMaterial({
  uniforms: {
    uColorHot:   { value: new THREE.Color(params.particleColorHot) },
    uColorMid:   { value: new THREE.Color(params.particleColorMid) },
    uColorBot:   { value: new THREE.Color(params.particleColorBot) },
    uBaseSize:   { value: params.particleSize },
    uPxScale:    { value: window.innerHeight / 2 },
    uBrightness: { value: params.particleBrightness },
  },
  vertexShader: /* glsl */`
    attribute float aSize;
    attribute float aColorMix;
    varying float vColorMix;
    uniform float uBaseSize, uPxScale;
    void main() {
      vColorMix = aColorMix;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position  = projectionMatrix * mv;
      gl_PointSize = aSize * uBaseSize * uPxScale / max(-mv.z, 0.0001);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColorHot, uColorMid, uColorBot;
    uniform float uBrightness;
    varying float vColorMix;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float d = length(uv) * 2.0;
      if (d > 1.0) discard;
      float alpha = pow(1.0 - d, 1.7);
      vec3 col = vColorMix < 0.5
        ? mix(uColorBot, uColorMid, vColorMix * 2.0)
        : mix(uColorMid, uColorHot, (vColorMix - 0.5) * 2.0);
      gl_FragColor = vec4(col * uBrightness, alpha);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const particleGeom = new THREE.BufferGeometry();
const particles    = new THREE.Points(particleGeom, particleMat);
scene.add(particles);

function buildParticles() {
  const N = params.particleCount;
  const positions  = new Float32Array(N * 3);
  const sizes      = new Float32Array(N);
  const colorMixes = new Float32Array(N);
  particleSpeeds   = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    positions[i*3+0] = (Math.random() - 0.5) * params.particleSpreadX * 2;
    positions[i*3+1] = params.particleYBase + (Math.random() - 0.5) * params.particleSpreadY;
    positions[i*3+2] = params.particleSpawnZ + Math.random() * (camera.position.z - params.particleSpawnZ);
    sizes[i]         = 0.5 + Math.random() * 1.5;
    colorMixes[i]    = Math.random();
    particleSpeeds[i] = 0.6 + Math.random() * 1.6;
  }
  particleGeom.setAttribute('position',  new THREE.BufferAttribute(positions,  3));
  particleGeom.setAttribute('aSize',     new THREE.BufferAttribute(sizes,      1));
  particleGeom.setAttribute('aColorMix', new THREE.BufferAttribute(colorMixes, 1));
}
buildParticles();

// ─── Layout (filled in after the GLB loads) ──────────────────────────────────
const layout = {
  ready: false,
  measuredFloorRadius: 0,
  floorCenter: new THREE.Vector3(),
  logoBboxMinY: 0,
  floorBboxMaxY: 0,
  floorMeshesByName: {},
};

// ─── Scroll-driven camera ─────────────────────────────────────────────────────
// Two cached camera states (start = above/looking down, end = resting front
// view). Each frame we lerp position + fov and slerp orientation between them by
// the eased scroll progress, so the footer "settles" into place as you scroll.
const _camScratch = new THREE.PerspectiveCamera();
const camStart = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 55 };
const camEnd   = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 55 };

function bakeCamState(out, pos, look, pitchDeg, yawDeg, rollDeg, fov) {
  const D = Math.PI / 180;
  _camScratch.up.set(0, 1, 0);
  _camScratch.position.copy(pos);
  _camScratch.lookAt(look);
  _camScratch.rotateX(pitchDeg * D);
  _camScratch.rotateY(yawDeg   * D);
  _camScratch.rotateZ(rollDeg  * D);
  out.pos.copy(pos);
  out.quat.copy(_camScratch.quaternion);
  out.fov = fov;
}

function computeCameraStates() {
  bakeCamState(camStart,
    new THREE.Vector3(params.camStartPosX, params.camStartPosY, params.camStartPosZ),
    new THREE.Vector3(params.camStartLookX, params.camStartLookY, params.camStartLookZ),
    0, 0, params.camStartRollDeg, params.camStartFov);
  bakeCamState(camEnd,
    new THREE.Vector3(params.posX, params.posY, params.posZ),
    new THREE.Vector3(params.lookX, params.lookY, params.lookZ),
    params.camPitchDeg, params.camYawDeg, params.camRollDeg, params.fov);
}

function applyCameraProgress(p) {
  if (!params.scrollCam) { // static — sit at the resting view
    camera.position.copy(camEnd.pos);
    camera.quaternion.copy(camEnd.quat);
    camera.fov = camEnd.fov;
    camera.updateProjectionMatrix();
    return;
  }
  // Optional smoothstep so the reveal eases in and out rather than tracking
  // scroll linearly (scrollCamEase blends between linear and full smoothstep).
  const s = p * p * (3 - 2 * p);
  const e = THREE.MathUtils.lerp(p, s, params.scrollCamEase);
  camera.position.lerpVectors(camStart.pos, camEnd.pos, e);
  camera.quaternion.slerpQuaternions(camStart.quat, camEnd.quat, e);
  camera.fov = THREE.MathUtils.lerp(camStart.fov, camEnd.fov, e);
  camera.updateProjectionMatrix();
}

// Section-relative progress (0 → footer entering, 1 → fully revealed at rest),
// so this works as one scene among several on the page. Falls back to whole-page
// scroll when the .footer-universe section isn't present.
function getScrollProgress() {
  if (scrollSection) {
    const rect = scrollSection.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    return range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0;
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function applyLayout() {
  if (!layout.ready) return;
  const glbScale = params.floorRadius / (layout.measuredFloorRadius || 1);
  floorGroup.scale.setScalar(glbScale);
  pedestalGroup.scale.setScalar(glbScale);
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
    yShift + logoYAdjust,
    params.sceneZ - layout.floorCenter.z * glbScale * params.logoExtraScale,
  );
  floorGroup.position.copy(floorBase);
  pedestalGroup.position.copy(floorBase);
  logoGroup.position.copy(logoBase);

  // Floor + pedestal are laid out here exactly once and never transformed again
  // (only the logo gets per-frame parallax). Freeze their matrices so the render
  // loop stops recomposing an unchanging local matrix every frame. updateMatrix()
  // bakes the current pos/scale first; matrixWorld still recomputes from the
  // (static) parent, so this is purely a redundant-CPU removal — zero visual.
  floorGroup.updateMatrix();    floorGroup.matrixAutoUpdate    = false;
  pedestalGroup.updateMatrix(); pedestalGroup.matrixAutoUpdate = false;

  positionStackedRings();
  // Mirror plane + the floor shader's world-space centre for the radial fade.
  reflector.position.set(floorBase.x, params.floorTargetY, floorBase.z);
  // The reflector plane is static too (only its RT contents change each frame via
  // onBeforeRender, which reads the unchanged matrixWorld) — freeze its matrix.
  reflector.updateMatrix(); reflector.matrixAutoUpdate = false;
  for (const mat of floorReflMats) {
    const sh = mat.userData.reflShader;
    if (sh) sh.uniforms.uFloorCenter.value.set(floorBase.x, floorBase.z);
  }
}

function bakeIntoGroup(meshes, group, material) {
  const bbox = new THREE.Box3();
  for (const mesh of meshes) {
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    mesh.geometry = geom;
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    if (material) mesh.material = material;
    group.add(mesh);
    geom.computeBoundingBox();
    bbox.union(geom.boundingBox);
  }
  return bbox;
}

computeCameraStates();
applyCameraProgress(getScrollProgress());

// ─── Pre-warm (compile the full pipeline before the reveal) ──────────────────
// The footer is off-screen at load, so its rAF loop is visibility-gated and does
// not run until the user scrolls to it. That means the VERY FIRST render — which
// compiles every post-processing shader (OutlinePass, UnrealBloomPass, the glass
// refraction ShaderMaterial) and allocates/populates the RTs — would otherwise
// happen mid-scroll and stall that frame. So we run ONE full render right here,
// while still off-screen, exercising the exact same render section animate() does:
// renderer.compile + the sceneRT glass capture + the Reflector RT (via its
// onBeforeRender during composer.render) + a real composer.render(). renderer.compile
// alone is insufficient — the post passes only compile on an actual composer.render().
// Runs exactly once, does NOT schedule/duplicate the rAF loop (the visibility gate
// still owns that), and restores every group.visible toggle it flips.
let warmedUp = false;
function warmUp() {
  if (warmedUp || !layout.ready) return;
  warmedUp = true;

  renderer.compile(scene, camera);

  // sceneRT glass capture — identical group toggles to animate(), restored after.
  logoGroup.visible     = false;
  reflector.visible     = false;
  floorGroup.visible    = false;
  pedestalGroup.visible = false;
  renderer.setRenderTarget(sceneRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  reflector.visible     = true;
  logoGroup.visible     = true;
  floorGroup.visible    = true;
  pedestalGroup.visible = true;

  // Full composer render — compiles the post passes and populates the Reflector RT
  // (reflector.onBeforeRender fires here, flipping reflectorRendered true).
  composer.render();

  // Reset the half-rate cadence guards so the first REAL frame re-captures from the
  // live reveal camera (warm-up ran at the load-time scroll pose). Warm-up's job was
  // only to compile shaders + allocate RTs, never to seed a displayed frame.
  glassCaptured     = false;
  reflectorRendered = false;
  frameCount        = 0;
}

// ─── GLB load ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

loader.load(ASSET_BASE + 'test_2_updated.glb', (gltf) => {
  gltf.scene.updateMatrixWorld(true);

  const logoMeshes = [], floorMeshes = [], pedestalMeshes = [];
  const infos = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const worldBox = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    infos.push({ mesh: o, worldBox });
    const name = o.name || '';
    if      (/logo|curve/i.test(name))               logoMeshes.push(o);
    else if (/^(?:C|Cylinder)_?\d+$/i.test(name))    floorMeshes.push(o);
    else                                             pedestalMeshes.push(o);
  });
  if (infos.length === 0) { console.error('GLB has no meshes.'); return; }

  floorMeshes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  // Fallback if nothing matched /logo|curve/ — take the topmost pedestal piece.
  if (logoMeshes.length === 0 && pedestalMeshes.length > 0) {
    pedestalMeshes.sort((a, b) => {
      const ay = infos.find((i) => i.mesh === a).worldBox.max.y;
      const by = infos.find((i) => i.mesh === b).worldBox.max.y;
      return by - ay;
    });
    logoMeshes.push(pedestalMeshes.shift());
  }

  floorMeshes.forEach((m) => {
    m.material = makeFloorCylinderMaterial('#000000');
    layout.floorMeshesByName[m.name] = m;
  });

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x081a1a, metalness: 0.4, roughness: 0.7,
    emissive: 0x041010, emissiveIntensity: 0.4,
    envMapIntensity: 0, side: THREE.DoubleSide,
  });
  pedestalMeshes.forEach((m) => { m.material = pedestalMat; });

  const logoBbox  = bakeIntoGroup(logoMeshes,     logoGroup,     logoFillMaterial);
  const floorBbox = bakeIntoGroup(floorMeshes,    floorGroup,    null);
  bakeIntoGroup(pedestalMeshes, pedestalGroup, pedestalMat);

  const selected = [];
  logoGroup.traverse((o) => { if (o.isMesh) { selected.push(o); o.renderOrder = 0; } });
  outlinePass.selectedObjects = selected;

  if (!logoBbox.isEmpty()) layout.logoBboxMinY = logoBbox.min.y;
  if (!floorBbox.isEmpty()) {
    layout.measuredFloorRadius = Math.max(
      floorBbox.max.x - floorBbox.min.x,
      floorBbox.max.z - floorBbox.min.z,
    ) / 2;
    floorBbox.getCenter(layout.floorCenter);
    layout.floorBboxMaxY = floorBbox.max.y;
  }
  layout.ready = true;

  applyLayout();
  buildStackedRings();
  stackedRingsGroup.rotation.y = params.stackedRingsYawDeg * Math.PI / 180;

  // Everything (layout, passes, RTs, rings) is now set up — compile the whole
  // pipeline once while off-screen so scrolling to the footer doesn't hitch.
  warmUp();
}, undefined, (err) => console.error('GLB load failed:', err));

// ─── Pointer + resize ────────────────────────────────────────────────────────
let mouseX = 0, mouseY = 0, mouseXs = 0, mouseYs = 0;
window.addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / window.innerWidth)  * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
});

// ─── Adaptive resolution ─────────────────────────────────────────────────────
// One helper drives EVERY per-viewport render-target dimension from a single
// effective pixel ratio, and is the ONLY place that resizes them. It's called
// from both the resize handler and the adaptive controller so the two can never
// disagree. effPR folds the (capped) device pixel ratio with renderScale; at
// renderScale=1 it equals the base `pr` captured at init, so the resulting
// sizes — and thus the rendered output — are byte-identical to before.
//   - renderer.setPixelRatio only re-runs setSize() with the renderer's STALE
//     stored width/height, so we still call renderer.setSize(w,h) to pick up a
//     new window size and refresh the canvas style.
//   - The glass blur samples tScene in TEXEL units, so uResolution MUST track
//     sceneRT's actual (floored) pixel size.
//   - The Reflector RT (reflectorRTSize) is intentionally NOT resized, and the
//     particle uPxScale (CSS-px based) is handled by the resize handler, not here.
let renderScale = 1;
const RS_FLOOR = 0.6, RS_STEP = 0.075;

function applyRenderTargets(w, h, effPR) {
  renderer.setPixelRatio(effPR);
  renderer.setSize(w, h);
  composer.setPixelRatio(effPR);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  outlinePass.setSize(w, h);
  sceneRT.setSize(Math.floor(w * effPR), Math.floor(h * effPR));
  logoFillMaterial.uniforms.uResolution.value.set(sceneRT.width, sceneRT.height);
}

// Adaptive controller — TRUE-GPU-COST design. The old version inferred load from
// RAW requestAnimationFrame INTERVALS, but that signal is floored by the display's
// vsync period (~16.7ms @60Hz): a fast GPU (2ms) and a GPU just coping (16ms) both
// read ~16.7ms, so a single stray frame could wrongly downscale even very capable
// hardware — a visible quality regression. Instead we measure the actual GPU frame
// time with an EXT_disjoint_timer_query_webgl2 TIME_ELAPSED query wrapped around the
// frame's render work, and decide against vsync-INDEPENDENT millisecond budgets. On
// a capable GPU rsGpuMs stays tiny (~1-3ms) << RS_BUDGET_MS, so it NEVER downscales
// → renderScale pinned at 1.0 → byte-identical output.
const gl = renderer.getContext();
// The timer-query extension exposes per-frame GPU cost. When it is absent (e.g.
// Safari, which never shipped it) the controller is DISABLED — no queries are ever
// issued, rsGpuMs is never sampled, and renderScale stays 1 forever (full quality,
// no adaptation). getExtension returns null rather than throwing when unsupported.
const rsExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

const RS_WARMUP    = 15;   // ignore the first N measured samples (shader/JIT warmup)
const RS_COOLDOWN  = 45;   // frames to wait after a scale change before another
const RS_SETTLE    = 2;    // measured samples to skip after a scale change / resume / resize (RT realloc perturbs timing)
const RS_BUDGET_MS = 13;   // sustained EMA above this ⇒ over budget (targets 60fps smoothness, vsync-independent)
const RS_HEADROOM_MS = 8;  // sustained EMA below this ⇒ clear headroom (deadband 8-13ms suppresses oscillation)
const RS_DOWN_HOLD = 20;   // consecutive over-budget samples before a downscale (short sustain window)
const RS_UP_HOLD   = 60;   // consecutive clear-headroom samples before an upscale (longer window)
// Entry-lag fix: for a short window after each activation, react to over-budget
// frames FAST. The footer resumes at full renderScale every time it scrolls into
// view, so a mid GPU spikes for the first frames of the reveal before the normal
// 20-sample sustain window reacts — that's the "lag when it enters view". During
// this window we downscale after just RS_DOWN_HOLD_FAST over-budget samples, then
// the normal UP_HOLD reclaims quality once the reveal settles. A capable GPU stays
// under budget throughout ⇒ rsOverCount never accrues ⇒ renderScale stays 1.0 ⇒
// byte-identical output; this only ever engages on hardware that's actually late.
const RS_DOWN_HOLD_FAST = 4;
const RS_FAST_FRAMES    = 45;

let rsQuery      = null;   // the single TIME_ELAPSED query currently in flight (null = none pending)
let rsGpuMs      = 0;      // EMA of the measured GPU frame cost in milliseconds
let rsGpuSeeded  = false;  // false until the first valid sample seeds the EMA
let rsWarmCount  = 0;      // measured samples since the last reset (warmup gate)
let rsCooldown   = 0;      // frames left before another scale change is allowed
let rsSettle     = 0;      // measured samples still to skip after a scale change / resume / resize
let rsOverCount  = 0;      // consecutive samples with rsGpuMs > RS_BUDGET_MS — the downscale sustain signal
let rsUnderCount = 0;      // consecutive samples with rsGpuMs < RS_HEADROOM_MS — the upscale sustain signal
let rsFastWindow = 0;      // post-activation samples still using the fast downscale hold (entry-lag fix)

// Reset the decision signal — called on resume so the stale EMA/counters from
// before the pause can't force a spurious scale change. The GPU-ms signal is
// wall-clock-independent, so the paused gap itself never pollutes it; we still
// re-seed the EMA and skip a couple of settling samples on resume.
function resetAdaptive() {
  rsWarmCount = 0; rsCooldown = 0;
  rsOverCount = 0; rsUnderCount = 0;
  rsGpuMs = 0; rsGpuSeeded = false;
  rsSettle = RS_SETTLE;
  rsFastWindow = RS_FAST_FRAMES;   // arm the fast-adapt window for this activation's reveal
}

function setRenderScale(next) {
  if (next === renderScale) return;
  renderScale = next;
  const effPR = Math.min(window.devicePixelRatio, TIER.dprCap) * renderScale;
  applyRenderTargets(window.innerWidth, window.innerHeight, effPR);
  rsCooldown   = RS_COOLDOWN;
  rsOverCount  = 0;
  rsUnderCount = 0;
  rsSettle     = RS_SETTLE;   // the RT reallocation happens this frame — skip the next couple of samples
}

// Fold one freshly-read GPU cost into the decision. Runs only when a query result
// has been read (see pollGpuTimer). Thresholds are absolute milliseconds, so the
// verdict is identical on 60/120/144Hz — no probe/backoff needed since headroom
// is now directly measured rather than inferred.
function decideRenderScale() {
  // Warmup gate: let shaders / JIT settle before trusting any sample.
  if (rsWarmCount < RS_WARMUP) { rsWarmCount++; return; }
  // Settle gate: discard the couple of samples right after a scale change / resume
  // / resize, whose timings are perturbed by the RT reallocation.
  if (rsSettle > 0) { rsSettle--; return; }

  // Fast-adapt window: count down the post-activation samples that use the short
  // downscale hold. Runs out to the normal hold once the reveal has settled.
  if (rsFastWindow > 0) rsFastWindow--;
  const downHold = rsFastWindow > 0 ? RS_DOWN_HOLD_FAST : RS_DOWN_HOLD;

  // Sustain counters against the deadband. rsGpuMs in [RS_HEADROOM_MS, RS_BUDGET_MS]
  // increments neither → the controller holds (no oscillation across the band).
  if (rsGpuMs > RS_BUDGET_MS)   rsOverCount++;  else rsOverCount  = 0;
  if (rsGpuMs < RS_HEADROOM_MS) rsUnderCount++; else rsUnderCount = 0;

  if (rsCooldown > 0) { rsCooldown--; return; }

  // DOWNSCALE one step on a sustained over-budget window (weak GPU, or a real load
  // spike). Never fires on a capable GPU whose rsGpuMs stays well under budget.
  if (rsOverCount >= downHold && renderScale > RS_FLOOR) {
    setRenderScale(Math.max(RS_FLOOR, renderScale - RS_STEP));
    return;
  }

  // UPSCALE one step on a sustained clear-headroom window — the measured GPU cost
  // directly proves the reclaim is safe, so recovery is immediate once cost drops.
  if (rsUnderCount >= RS_UP_HOLD && renderScale < 1) {
    setRenderScale(Math.min(1, renderScale + RS_STEP));
  }
}

// Poll the previously-issued timer query. Keeps exactly ONE query in flight: only
// after the prior one is read (or discarded) is rsQuery cleared so animate() may
// start the next. When a valid result is ready, fold it into the EMA and decide.
function pollGpuTimer() {
  if (!rsExt || rsQuery === null) return;
  // If the GPU signalled a disjoint event, every timing straddling it is invalid —
  // discard this query WITHOUT touching the EMA.
  if (gl.getParameter(rsExt.GPU_DISJOINT_EXT)) {
    gl.deleteQuery(rsQuery);
    rsQuery = null;
    return;
  }
  // Not ready yet → leave it pending (still the one query in flight), read next frame.
  if (!gl.getQueryParameter(rsQuery, gl.QUERY_RESULT_AVAILABLE)) return;

  const gpuMs = gl.getQueryParameter(rsQuery, gl.QUERY_RESULT) / 1e6; // ns → ms
  gl.deleteQuery(rsQuery);
  rsQuery = null;

  if (!rsGpuSeeded) { rsGpuMs = gpuMs; rsGpuSeeded = true; }
  else              { rsGpuMs += (gpuMs - rsGpuMs) * 0.1; }
  decideRenderScale();
}

window.addEventListener('resize', onViewportResize);
if (window.visualViewport) {
  // A mobile URL-bar show/hide fires visualViewport resize without a window
  // resize; route it through the same helper so it RE-APPLIES the current
  // renderScale instead of snapping back to full DPR mid-session.
  window.visualViewport.addEventListener('resize', onViewportResize);
}

function onViewportResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const effPR = Math.min(window.devicePixelRatio, TIER.dprCap) * renderScale;
  applyRenderTargets(w, h, effPR);
  particleMat.uniforms.uPxScale.value = h / 2;
  rsSettle = RS_SETTLE;   // don't let the resize-frame RT reallocation spike bias the EMA
}

// ─── Debug HUD (opt-in via ?debug) ───────────────────────────────────────────
// A tiny on-screen readout for on-device testing: which tier resolved, the live
// renderScale + effective DPR, FPS, and measured GPU ms (when the timer query
// exists). Gated on a URL param so it never appears in production — add ?debug to
// the URL. Purely a measurement aid; touches nothing in the render path.
const DEBUG = /(?:^|[?&#])debug\b/i.test(location.search + location.hash);
let dbgEl = null, dbgFrames = 0, dbgAccum = 0, dbgFps = 0;
if (DEBUG) {
  dbgEl = document.createElement('div');
  dbgEl.style.cssText =
    'position:fixed;top:8px;left:8px;z-index:99999;font:12px/1.45 monospace;' +
    'color:#ffc34b;background:rgba(0,0,0,.62);padding:7px 9px;border-radius:6px;' +
    'pointer-events:none;white-space:pre;letter-spacing:.2px;';
  document.body.appendChild(dbgEl);
}

// ─── Render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
const DEG  = Math.PI / 180;

let rafId    = null;
let running  = false;

function animate() {
  rafId = requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 1 / 30);
  const t  = clock.getElapsedTime();

  // Debug HUD: roll up FPS over ~0.5s of real (unclamped) frame time and print the
  // resolved tier / scale so on-device smoothness is a number, not a guess.
  if (DEBUG) {
    dbgAccum += rawDt; dbgFrames++;
    if (dbgAccum >= 0.5) {
      dbgFps = dbgFrames / dbgAccum; dbgAccum = 0; dbgFrames = 0;
      const effPR = Math.min(window.devicePixelRatio, TIER.dprCap) * renderScale;
      dbgEl.textContent =
        `tier:  ${IS_MOBILE ? 'MOBILE (low-power)' : 'desktop'}\n` +
        `fps:   ${dbgFps.toFixed(0)}\n` +
        `scale: ${renderScale.toFixed(3)}\n` +
        `DPR:   ${effPR.toFixed(2)} (cap ${TIER.dprCap})\n` +
        `gpuMs: ${rsExt ? rsGpuMs.toFixed(1) : 'n/a — no timer query'}\n` +
        `blurR ${TIER.blurTaps}  msaa ${TIER.msaaSamples}  refl ${TIER.reflectorMax}`;
    }
  }

  // Scroll-driven camera reveal: high above the logo → resting front view.
  applyCameraProgress(getScrollProgress());

  // Mouse parallax on the logo.
  mouseXs = damp(mouseXs, mouseX, params.parallaxSmoothRate, dt);
  mouseYs = damp(mouseYs, mouseY, params.parallaxSmoothRate, dt);
  const baseYaw = params.logoYawDeg * DEG;
  logoGroup.rotation.x = -mouseYs * params.parallaxRotX;
  logoGroup.rotation.y = baseYaw + mouseXs * params.parallaxRotY;
  logoGroup.rotation.z =           mouseXs * params.parallaxRotZ;
  logoGroup.position.x = logoBase.x + mouseXs * params.parallaxPos;
  logoGroup.position.y = logoBase.y - mouseYs * params.parallaxPos;

  // Stadium ring sweep + per-ring sine pitch (random phase keeps them out of sync).
  for (const mesh of stackedRingMeshes) {
    const u = mesh.material.userData.neon;
    // Only uTime varies per frame. uArcWidth / uBaseIntensity / uPeakBoost /
    // uPulseDepth are products of runtime-constant params.* and build-baked anim.*
    // multipliers — they are set once at material creation and never change, so
    // re-assigning them every frame is redundant (identical value each time).
    u.uTime.value          = t;
    const spec = mesh.userData.spec;
    mesh.rotation.x = Math.sin(t * spec.tiltSpeed + mesh.userData.tiltPhase) * spec.tiltAmp * DEG;
  }

  // Particles: advance forward, recycle past the camera.
  const pos = particleGeom.attributes.position;
  const arr = pos.array;
  const recycleZ = camera.position.z + 3;
  for (let i = 0; i < particleSpeeds.length; i++) {
    const idx = i * 3 + 2;
    arr[idx] += particleSpeeds[i] * params.particleSpeed * dt;
    if (arr[idx] > recycleZ) {
      arr[idx]     = params.particleSpawnZ + (Math.random() - 0.5) * 4;
      arr[i*3]     = (Math.random() - 0.5) * params.particleSpreadX * 2;
      arr[i*3 + 1] = params.particleYBase + (Math.random() - 0.5) * params.particleSpreadY;
    }
  }
  pos.needsUpdate = true;

  logoFillMaterial.uniforms.uTime.value = t;

  // ─── Adaptive-resolution GPU timing ────────────────────────────────────────
  // First poll the previously-issued query (may fold a sample + change scale),
  // THEN wrap this frame's GPU render work — the sceneRT glass capture, the
  // Reflector RT (via its onBeforeRender during composer.render), AND
  // composer.render() — in a single TIME_ELAPSED query. Only start a new query
  // when none is pending (one in flight at a time); disabled when unsupported.
  pollGpuTimer();
  const rsMeasuring = rsExt !== null && rsQuery === null;
  if (rsMeasuring) {
    rsQuery = gl.createQuery();
    gl.beginQuery(rsExt.TIME_ELAPSED_EXT, rsQuery);
  }

  // Capture the scene WITHOUT the logo (+ floor + pedestal + reflector) into
  // sceneRT for the logo's glass shader to refract. Half-rated (technique 3):
  // re-captured every GLASS_CAPTURE_EVERY frames; on skipped frames the glass
  // shader reuses the previous sceneRT texture (heavily blurred + distorted, so
  // one frame stale is imperceptible). Always captured on the first frame
  // (glassCaptured guard) so the texture is initialised before it is displayed.
  if (layout.ready && (!glassCaptured || (frameCount % GLASS_CAPTURE_EVERY) === 0)) {
    logoGroup.visible     = false;
    reflector.visible     = false;
    floorGroup.visible    = false;
    pedestalGroup.visible = false;
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    reflector.visible     = true;
    logoGroup.visible     = true;
    floorGroup.visible    = true;
    pedestalGroup.visible = true;
    glassCaptured = true;
  }

  composer.render();

  // Close the query immediately after the last render call so it spans exactly
  // the frame's GPU work; its result is read on a later frame by pollGpuTimer.
  if (rsMeasuring) gl.endQuery(rsExt.TIME_ELAPSED_EXT);
  frameCount++;
}

// ─── Visibility gate ─────────────────────────────────────────────────────────
// The footer sits at the bottom of a tall sticky section, so it's offscreen most
// of the session — and a backgrounded tab shouldn't burn GPU either. Render only
// while BOTH the mount is on-screen AND the tab is visible; otherwise fully stop
// the loop (no rAF scheduled) so the heavy postpro pipeline actually ceases.
let onscreen = false;
let visible  = !document.hidden;

function start() {
  if (running) return;   // idempotent — never two concurrent rAF loops
  running = true;
  clock.getDelta();      // discard the stale delta accrued while paused (no time jump)
  resetAdaptive();       // drop the pre-pause EMA/counters so the resume-gap interval can't force a spurious downscale
  rafId = requestAnimationFrame(animate);
}

function stop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

function updateRunState() {
  if (onscreen && visible) start();
  else                     stop();
}

// Kept alive for the page lifetime — never disconnected.
const visibilityObserver = new IntersectionObserver((entries) => {
  onscreen = entries[entries.length - 1].isIntersecting;
  updateRunState();
});
visibilityObserver.observe(mountEl);

document.addEventListener('visibilitychange', () => {
  visible = !document.hidden;
  updateRunState();
});

updateRunState();
