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

// ─── Renderer + scene ────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Cap DPR a touch below the device max — keeps the heavy postpro pipeline
// (planar reflection + sceneRT + composer) within budget on retina/mobile.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
  { type: THREE.HalfFloatType, samples: 4 },
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

// ─── Reflector (hidden — used only for its RT) ───────────────────────────────
// CircleGeometry sized to the floor footprint. material.colorWrite/depthWrite
// off means it contributes no pixels visually, but its onBeforeRender still
// fires each frame and renders the scene from the mirrored virtual camera.
const reflectorRTSize = Math.min(1024, Math.floor(window.innerWidth * pr));
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
  const wasLogo = logoGroup.visible, wasFloor = floorGroup.visible, wasPed = pedestalGroup.visible;
  logoGroup.visible = floorGroup.visible = pedestalGroup.visible = false;
  _reflectorBefore(r, s, c);
  logoGroup.visible = wasLogo; floorGroup.visible = wasFloor; pedestalGroup.visible = wasPed;
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
      for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
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
         for (int dy = -2; dy <= 2; dy++) {
           for (int dx = -2; dx <= 2; dx++) {
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

  positionStackedRings();
  // Mirror plane + the floor shader's world-space centre for the radial fade.
  reflector.position.set(floorBase.x, params.floorTargetY, floorBase.z);
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

// ─── GLB load ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

loader.load('./test_2_updated.glb', (gltf) => {
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
}, undefined, (err) => console.error('GLB load failed:', err));

// ─── Pointer + resize ────────────────────────────────────────────────────────
let mouseX = 0, mouseY = 0, mouseXs = 0, mouseYs = 0;
window.addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / window.innerWidth)  * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
});

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  outlinePass.setSize(w, h);
  sceneRT.setSize(Math.floor(w * pr), Math.floor(h * pr));
  logoFillMaterial.uniforms.uResolution.value.set(sceneRT.width, sceneRT.height);
  particleMat.uniforms.uPxScale.value = h / 2;
});

// ─── Render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
const DEG  = Math.PI / 180;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t  = clock.getElapsedTime();

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
    const u = mesh.material.userData.neon, anim = mesh.material.userData.anim;
    u.uTime.value          = t;
    u.uArcWidth.value      = params.neonArcWidth      * anim.arcWidthMul;
    u.uBaseIntensity.value = params.neonBaseIntensity * anim.baseIntensityMul;
    u.uPeakBoost.value     = params.neonPeakBoost     * anim.peakBoostMul;
    u.uPulseDepth.value    = params.neonPulseDepth    * anim.pulseDepthMul;
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

  // Capture the scene WITHOUT the logo (+ floor + pedestal + reflector) into
  // sceneRT for the logo's glass shader to refract.
  if (layout.ready) {
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
  }

  composer.render();
}
animate();
