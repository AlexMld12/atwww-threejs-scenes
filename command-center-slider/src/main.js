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
const MSAA_SAMPLES       = IS_MOBILE ? 0   : 2;
const REFLECTOR_RT_SCALE = IS_MOBILE ? 0.4 : 0.5;
const ENABLE_REFLECTORS  = !IS_MOBILE;

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

// ─── Loader overlay (plain black, hides the canvas until assets are ready) ──
const loaderEl = document.createElement('div');
loaderEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;transition:opacity 0.6s ease-out';
document.body.appendChild(loaderEl);

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
  logoAnim.phase      = 'intro';
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

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
// Layer 1 = "main view only" — used for the hover masks so the planar
// reflectors (whose virtual camera defaults to layer 0) don't see the dark
// red mask covering the videos. The reflection then shows the bare video
// textures instead of a smear of mask color.
const LAYER_MAIN_ONLY = 1;
camera.layers.enable(LAYER_MAIN_ONLY);

// ─── Postprocessing (EffectComposer) ────────────────────────────────────────
// EffectComposer renders into an offscreen RT, which bypasses the renderer's
// own MSAA. Give the composer its own RT with samples:4 so the OutlinePass'
// thin neon edges don't ladder, and HalfFloatType so any future HDR pass
// doesn't clip bright pixels.
const composerRT = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  { type: THREE.HalfFloatType, samples: MSAA_SAMPLES },
);
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));

const outlinePass = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera,
);
outlinePass.edgeStrength    = 4.0;
outlinePass.edgeGlow        = 0.8;
outlinePass.edgeThickness   = 1.0;
outlinePass.downSampleRatio = 1;  // edge buffers at full res — kills outline stairs
outlinePass.visibleEdgeColor.set('#f95921');
outlinePass.hiddenEdgeColor.set('#f95921');
composer.addPass(outlinePass);
// SMAA smooths the outline's post-process edges (which MSAA can't touch
// since they're drawn after the resolved render pass).
const pr = renderer.getPixelRatio();
composer.addPass(new SMAAPass(window.innerWidth * pr, window.innerHeight * pr));
composer.addPass(new OutputPass());

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
  floorMetalness: 0.6,
  floorRoughness: 0.25,
  videoEmission:  4,

  // Floor planar reflector (gives a real, curved mirror reflection of the
  // screens — ring shape so the inner well around the logo isn't covered).
  reflectorEnabled:    ENABLE_REFLECTORS,
  reflectorInnerRadius: 2.0,
  reflectorTint:       '#850f0f',
  reflectorLift:       0.001,
  reflectorBlur:       0.0035,        // crisp mirror by default

  // Roof planar reflector — same idea but flipped, with a touch of blur so
  // the ceiling reads as a softer mirror.
  roofReflectorEnabled:    ENABLE_REFLECTORS,
  roofReflectorInnerRadius: 0,
  roofReflectorTint:       '#230505',
  roofReflectorLift:       0.008,  // offset DOWN from the ceiling underside
  roofReflectorBlur:       0.0035,

  // Logo glass/ice (MeshPhysicalMaterial transmission)
  logoGlassColor:        '#850f0f',  // base color of the glass
  logoGlassTint:         '#850f0f',  // attenuation tint inside the volume
  logoGlassTintDistance: 1.0,        // attenuation distance — smaller = more tint
  logoGlassIor:          2.5,       // ~1 = no refraction, 1.5 = glass, 2.4 = diamond
  logoGlassRoughness:    0.13,       // 0 = perfectly clear, 1 = fully diffuse
  logoGlassThickness:    0,        // volume thickness for refraction depth
  logoGlassTransmission: 1.0,        // 0 = opaque, 1 = fully see-through

  // Logo orientation + intro animation
  logoRotationY:    90,   // degrees around Y so the logo faces the camera
  logoAnimRise:     2,    // start this far BELOW logoBase, then rise to it
  logoAnimDuration: 3,    // rise + opacity fade + outline ramp all share this
  spotAnimDuration: 6,    // spotlight ramps independently over this duration

  // Neon outline (OutlinePass)
  outlineEnabled:   true,
  outlineColor:     '#f95921',       // gradient top by default
  outlineStrength:  4.0,
  outlineGlow:      2,
  outlineThickness: 1.0,

  // Camera (orbital around the logo, yaw-only)
  fov:               70,
  cameraDistance:    4,
  cameraHeight:      0.0,
  cameraThetaDeg:    0,
  lookOffsetX:       0,
  lookOffsetY:       2,
  lookOffsetZ:       0,

  // Scene layout
  sceneZ:           -5,
  floorTargetY:     -1.4,
  floorRadius:      7,
  logoExtraScale:   1.0,

  // Interaction
  cameraDragSensitivity: 0.001,
  cameraFollowRate:      2,
  cameraInvertX:         false,

  // Hover mask on the video planes
  maskColor:       '#2e0000',
  maskBaseOpacity: 0.95,
  maskFadeRate:    16,
  maskBlur:        0.005,
  maskNoiseAmount: 0.12,   // 0 = none, 1 = full TV static
  maskNoiseSpeed:  60,     // higher = faster scrambling
  hoverBadgeSize:  0.16,   // sticker size as a fraction of the screen's UV (0..1)

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

// `import.meta.env.BASE_URL` keeps these resolving relative to the deployed
// page (e.g. under the GitHub Pages subfolder), not the domain root.
const TEST_VIDEOS = [
  `${import.meta.env.BASE_URL}videos/clip_1.mp4`,
  `${import.meta.env.BASE_URL}videos/clip_2.mp4`,
  `${import.meta.env.BASE_URL}videos/clip_3.mp4`,
  `${import.meta.env.BASE_URL}videos/clip_4.mp4`,
  `${import.meta.env.BASE_URL}videos/clip_5.mp4`,
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

// ─── Hover badge ("HOVER" sticker) shared by every video mask ───────────────
const hoverBadgeTexture = (() => {
  const SIZE = 512;
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');
  const cx = SIZE / 2, cy = SIZE / 2;
  // Thin outer ring — subtle, no fill, lets the video below breathe through.
  ctx.strokeStyle = 'rgba(249, 89, 33, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, SIZE / 2 - 80, 0, Math.PI * 2); ctx.stroke();
  // Even fainter inner ring — gives it depth without a heavy fill.
  ctx.strokeStyle = 'rgba(249, 89, 33, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, SIZE / 2 - 96, 0, Math.PI * 2); ctx.stroke();
  // Clean label, letter-spaced
  ctx.fillStyle = 'rgba(249, 89, 33, 0.95)';
  ctx.font = '500 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H O V E R', cx, cy);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Match the video texture's orientation convention so the sticker
  // shares the same UV mapping on the curved screen (otherwise the
  // canvas Y axis flips relative to the video).
  tex.flipY = false;
  return tex;
})();

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
      uBadgeTex:     { value: hoverBadgeTexture },
      uBadgeScale:   { value: params.hoverBadgeSize },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uVideo;
      uniform vec3 uMaskColor;
      uniform float uOpacity;
      uniform float uBlur;
      uniform float uNoiseAmount;
      uniform float uTime;
      uniform sampler2D uBadgeTex;
      uniform float uBadgeScale;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float r = uBlur * uOpacity;
        vec3 sum = vec3(0.0);
        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            vec2 off = vec2(float(x), float(y)) * r;
            sum += texture2D(uVideo, vUv + off).rgb;
          }
        }
        vec3 bg = sum / 25.0;
        vec3 finalColor = mix(bg, uMaskColor, uOpacity);
        // Dark-red noise grain that fades with the mask.
        float n = hash(vUv * 720.0 + uTime);
        finalColor = mix(finalColor, uMaskColor * n, uNoiseAmount * uOpacity);
        // "HOVER" sticker painted into the screen UVs, centered at (0.5, 0.5).
        // Lives on the curved surface, so it warps with perspective and stays
        // fixed on the screen no matter how the camera orbits.
        vec2 badgeUv = (vUv - 0.5) / uBadgeScale + 0.5;
        if (badgeUv.x >= 0.0 && badgeUv.x <= 1.0 && badgeUv.y >= 0.0 && badgeUv.y <= 1.0) {
          vec4 badge = texture2D(uBadgeTex, badgeUv);
          finalColor = mix(finalColor, badge.rgb, badge.a * uOpacity);
        }
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

// ─── Groups ──────────────────────────────────────────────────────────────────
const logoGroup   = new THREE.Group();
const floorGroup  = new THREE.Group();
const videosGroup = new THREE.Group();
const ringGroup   = new THREE.Group();
const logoBase    = new THREE.Vector3();
const floorBase   = new THREE.Vector3();
scene.add(logoGroup, floorGroup, videosGroup, ringGroup);

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
    textureWidth:  Math.floor(window.innerWidth  * REFLECTOR_RT_SCALE),
    textureHeight: Math.floor(window.innerHeight * REFLECTOR_RT_SCALE),
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
  logoGroup.scale.setScalar(glbScale * params.logoExtraScale);

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
  videosGroup.position.copy(floorBase);
  logoGroup.position.copy(logoBase);
  logoGroup.rotation.y = params.logoRotationY * Math.PI / 180;

  // Don't override an in-flight intro animation with the resting position.
  if (logoAnim.phase === 'intro') logoGroup.position.y = logoAnim.currentY;

  updateRingLightPosition();
  positionFloorReflector();
  positionRoofReflector();
}

// ─── Initial application ─────────────────────────────────────────────────────
rebuildRingLight();
applyColors();
camera.fov = params.fov;
camera.updateProjectionMatrix();

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

loader.load(`${import.meta.env.BASE_URL}test_3.glb`, (gltf) => {
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
    m.material = new THREE.MeshStandardMaterial({
      color: params[key] ?? 0x000000,
      metalness: params.floorMetalness,
      roughness: params.floorRoughness,
      side: THREE.DoubleSide,
    });
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

    const maskTowardCenter = new THREE.Vector3();
    videoMeshes.forEach((m) => {
      buildSlicedVideoLights(m, sceneCenter);

      m.userData.sampledVideoColor = new THREE.Color(0xffffff);
      m.userData.lastVideoColor    = new THREE.Color(0xffffff);

      // Hover-fade mask: frosted-glass shader that blurs the video texture
      // and tints it red. Sits just in front of the video plane (toward the
      // scene center) so depth test keeps the logo on top.
      const center = new THREE.Vector3();
      m.geometry.boundingBox.getCenter(center);
      const maskGeom = m.geometry.clone();
      const mask = new THREE.Mesh(maskGeom, makeMaskMaterial());
      maskTowardCenter.copy(sceneCenter).sub(center).normalize().multiplyScalar(0.005);
      mask.position.copy(maskTowardCenter);
      // Render mask only into the main camera, not into the reflectors —
      // so the floor/ceiling mirrors see the bare video plane behind it.
      mask.layers.set(LAYER_MAIN_ONLY);
      m.add(mask);
      m.userData.maskMesh = mask;
      m.userData.hovered  = false;

      // The "HOVER" sticker is drawn inside the mask shader itself (using
      // the screen's own UVs), so it lives on the curved surface and warps
      // with perspective. Nothing to add here.
    });
  }

  if (!logoBbox.isEmpty()) layout.logoBboxMinY = logoBbox.min.y;
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
  outlinePass.selectedObjects = logoGroup.children.slice();

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

// ─── Camera orbit input (yaw only) ───────────────────────────────────────────
const DEG = Math.PI / 180;
let cameraTheta       = params.cameraThetaDeg * DEG;
let cameraThetaTarget = cameraTheta;

function syncCameraAnglesFromParams() {
  cameraThetaTarget = params.cameraThetaDeg * DEG;
  cameraTheta       = cameraThetaTarget;
}

let isDragging = false;
let dragStartX = 0;
let dragStartTheta = 0;

const canvasEl = renderer.domElement;

canvasEl.addEventListener('pointerdown', (e) => {
  isDragging = true;
  canvasEl.setPointerCapture(e.pointerId);
  dragStartX = e.clientX;
  dragStartTheta = cameraThetaTarget;
});

const raycaster = new THREE.Raycaster();
const ndcMouse  = new THREE.Vector2();

window.addEventListener('pointermove', (e) => {
  if (isDragging) {
    const sx = params.cameraInvertX ? -1 : 1;
    const dx = e.clientX - dragStartX;
    cameraThetaTarget = dragStartTheta + sx * dx * params.cameraDragSensitivity;
  }

  // Hover detection over video planes.
  ndcMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  ndcMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndcMouse, camera);
  const hits = raycaster.intersectObjects(layout.videoMeshes, false);
  layout.videoMeshes.forEach((m) => (m.userData.hovered = false));
  if (hits.length > 0) hits[0].object.userData.hovered = true;
});

function endDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  try { canvasEl.releasePointerCapture(e.pointerId); } catch {}
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// ─── Comet trail (mouse overlay, 2D canvas above the WebGL canvas) ──────────
const cometParams = {
  enabled:  true,
  size:     5,    // base radius (CSS px)
  spacing:  5,     // px between spawned particles along the mouse path
  fadeRate: 1,   // life decay per second (higher = shorter trail)
  drift:    3,   // random per-particle velocity (px/frame)
};

const trailCanvas = document.createElement('canvas');
trailCanvas.style.position      = 'fixed';
trailCanvas.style.inset         = '0';
trailCanvas.style.pointerEvents = 'none';
trailCanvas.style.zIndex        = '1';
document.body.appendChild(trailCanvas);
const trailCtx = trailCanvas.getContext('2d');

function resizeTrail() {
  const dpr = window.devicePixelRatio || 1;
  trailCanvas.width  = window.innerWidth  * dpr;
  trailCanvas.height = window.innerHeight * dpr;
  trailCanvas.style.width  = window.innerWidth  + 'px';
  trailCanvas.style.height = window.innerHeight + 'px';
  trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeTrail();

const cometParticles = [];
let lastCometX = 0, lastCometY = 0, lastCometValid = false;

window.addEventListener('pointermove', (e) => {
  if (!cometParams.enabled) { lastCometValid = false; return; }
  if (lastCometValid) {
    const dx   = e.clientX - lastCometX;
    const dy   = e.clientY - lastCometY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const count = Math.max(1, Math.min(40, Math.floor(dist / cometParams.spacing)));
      for (let i = 0; i < count; i++) {
        const t = i / count;
        cometParticles.push({
          x:   lastCometX + dx * t,
          y:   lastCometY + dy * t,
          vx:  (Math.random() - 0.5) * cometParams.drift,
          vy:  (Math.random() - 0.5) * cometParams.drift,
          life: 1,
          size: cometParams.size * (0.6 + Math.random() * 0.6),
          hue:  Math.random(),
        });
      }
    }
  }
  lastCometX = e.clientX;
  lastCometY = e.clientY;
  lastCometValid = true;
});

const _cometA   = new THREE.Color();
const _cometB   = new THREE.Color();
const _cometMix = new THREE.Color();

function updateCometTrail(dt) {
  trailCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (cometParticles.length === 0) return;

  _cometA.set(params.gradientBottom);
  _cometB.set(params.gradientTop);

  trailCtx.globalCompositeOperation = 'lighter';
  for (let i = cometParticles.length - 1; i >= 0; i--) {
    const p = cometParticles[i];
    p.life -= dt * cometParams.fadeRate;
    p.x += p.vx;
    p.y += p.vy;
    if (p.life <= 0) { cometParticles.splice(i, 1); continue; }

    _cometMix.copy(_cometA).lerp(_cometB, p.hue);
    const r = (_cometMix.r * 255) | 0;
    const g = (_cometMix.g * 255) | 0;
    const b = (_cometMix.b * 255) | 0;
    const alpha = p.life * p.life * 0.8;
    const size  = p.size * p.life;

    const grad = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
    grad.addColorStop(0,   `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.35})`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    trailCtx.fillStyle = grad;
    trailCtx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
  }
  trailCtx.globalCompositeOperation = 'source-over';
}

// ─── Planet camera control (mini top-down orbit dial, bottom-right) ─────────
const PLANET_SIZE = 110;
const planetEl = document.createElement('div');
planetEl.style.cssText = [
  'position:fixed',
  `right:20px`, `bottom:20px`,
  `width:${PLANET_SIZE}px`, `height:${PLANET_SIZE}px`,
  'z-index:100',
  'cursor:grab',
  'touch-action:none',
  'user-select:none',
].join(';');
planetEl.innerHTML = `
  <svg width="${PLANET_SIZE}" height="${PLANET_SIZE}" viewBox="0 0 ${PLANET_SIZE} ${PLANET_SIZE}">
    <defs>
      <radialGradient id="ccs_planetBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stop-color="#1a0606" stop-opacity="0.9"/>
        <stop offset="85%" stop-color="#000000" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${PLANET_SIZE / 2}" cy="${PLANET_SIZE / 2}" r="${PLANET_SIZE / 2 - 4}"
            fill="url(#ccs_planetBg)" stroke="#f95921" stroke-width="1" stroke-opacity="0.55"/>
    <circle cx="${PLANET_SIZE / 2}" cy="${PLANET_SIZE / 2}" r="5" fill="#f95921"/>
    <circle id="ccs_planetDot" r="6" fill="#fff" stroke="#f95921" stroke-width="2"
            cx="${PLANET_SIZE / 2}" cy="${PLANET_SIZE / 2 + (PLANET_SIZE / 2 - 12)}"/>
  </svg>
`;
document.body.appendChild(planetEl);
const planetDot = planetEl.querySelector('#ccs_planetDot');
const PLANET_ORBIT_R = PLANET_SIZE / 2 - 12;

function updatePlanet() {
  const cx = PLANET_SIZE / 2, cy = PLANET_SIZE / 2;
  // cameraTheta = 0 → camera in its initial position (in front of the logo)
  // → dot at the BOTTOM of the dial (closer to the viewer in top-down view).
  const x = cx + Math.sin(cameraTheta) * PLANET_ORBIT_R;
  const y = cy + Math.cos(cameraTheta) * PLANET_ORBIT_R;
  planetDot.setAttribute('cx', x);
  planetDot.setAttribute('cy', y);
}

let planetDragging = false;
function planetAngleFromEvent(e) {
  const rect = planetEl.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width  / 2);
  const dy = e.clientY - (rect.top  + rect.height / 2);
  // Bottom of dial (positive dy) → theta 0, matching the initial camera pose.
  return Math.atan2(dx, dy);
}
function planetSetAngle(e) {
  const angle = planetAngleFromEvent(e);
  cameraThetaTarget = angle;
  cameraTheta       = angle; // snap so click/drag move the camera 1:1
}
planetEl.addEventListener('pointerdown', (e) => {
  planetDragging = true;
  planetEl.setPointerCapture(e.pointerId);
  planetEl.style.cursor = 'grabbing';
  planetSetAngle(e);
});
planetEl.addEventListener('pointermove', (e) => {
  if (!planetDragging) return;
  planetSetAngle(e);
});
function planetEnd(e) {
  if (!planetDragging) return;
  planetDragging = false;
  try { planetEl.releasePointerCapture(e.pointerId); } catch {}
  planetEl.style.cursor = 'grab';
}
planetEl.addEventListener('pointerup', planetEnd);
planetEl.addEventListener('pointercancel', planetEnd);

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  outlinePass.setSize(window.innerWidth, window.innerHeight);
  resizeTrail();
});


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
      mesh.material.map = tex;
      mesh.material.color.set(0xffffff);
      mesh.material.needsUpdate = true;
      // Feed the same texture into the mask shader so it can blur it.
      const mask = mesh.userData.maskMesh;
      if (mask?.material?.uniforms) mask.material.uniforms.uVideo.value = tex;
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

  cameraTheta = damp(cameraTheta, cameraThetaTarget, params.cameraFollowRate, dt);

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
    u.uBadgeScale.value  = params.hoverBadgeSize;
    // Ease the displayed color toward the most-recent sample to kill flicker.
    m.userData.lastVideoColor.lerp(m.userData.sampledVideoColor, colorMix);
    if (light) {
      const lightAlpha = u.uOpacity.value * params.lightMaskInfluence;
      light.color.copy(m.userData.lastVideoColor).lerp(_maskColor, lightAlpha);
    }
  }

  lookTarget.set(
    logoBase.x + params.lookOffsetX,
    logoBase.y + params.lookOffsetY,
    logoBase.z + params.lookOffsetZ,
  );

  camera.position.set(
    lookTarget.x + params.cameraDistance * Math.sin(cameraTheta),
    lookTarget.y + params.cameraHeight,
    lookTarget.z + params.cameraDistance * Math.cos(cameraTheta),
  );
  camera.lookAt(lookTarget);
  updatePlanet();

  if (logoAnim.phase === 'intro') {
    const elapsed = performance.now() / 1000 - logoAnim.phaseStart;
    const t  = Math.min(1, elapsed / params.logoAnimDuration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const startY = logoBase.y - params.logoAnimRise;
    logoAnim.currentY = startY + (logoBase.y - startY) * eased;
    logoGroup.position.y  = logoAnim.currentY;
    glassMaterial.opacity = eased;
    // Outline kicks in at the halfway point — remap t in [0.5..1].
    const ot = Math.max(0, (t - 0.5) * 2);
    outlinePass.edgeStrength = params.outlineStrength * (1 - Math.pow(1 - ot, 3));
    // Spotlight has its own (typically longer) timeline.
    const st = Math.min(1, elapsed / params.spotAnimDuration);
    const sEased = 1 - Math.pow(1 - st, 3);
    if (logoSpot) logoSpot.intensity = params.ringIntensity * sEased;
    // Phase ends only when both timelines complete.
    if (t >= 1 && st >= 1) {
      logoGroup.position.y     = logoBase.y;
      glassMaterial.opacity    = 1;
      outlinePass.edgeStrength = params.outlineStrength;
      if (logoSpot) logoSpot.intensity = params.ringIntensity;
      logoAnim.phase           = 'done';
    }
  }

  composer.render();
  updateCometTrail(dt);
}
animate();
