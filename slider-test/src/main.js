import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Mobile/low-end devices get a lighter render budget — fewer pixels and a
// half-res transmission pass — to keep the scene smooth on phones.
const IS_MOBILE = matchMedia('(max-width: 768px), (pointer: coarse)').matches;

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.transmissionResolutionScale = IS_MOBILE ? 0.7 : 1.0;
document.getElementById('app').appendChild(renderer.domElement);

// ─── Scene + camera + lights ─────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFCFCFA);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(3, 5, 2);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffd9b8, 0.4);
fillLight.position.set(-2, 2, -1);
scene.add(fillLight);

// ─── Reflection cube camera (floor reflects what it sees) ────────────────────
// Renders the scene from a fixed point just above the top of the floor; the
// floor materials sample this cube texture as their envMap to "reflect" the
// slider + logo.
const reflectionRT = new THREE.WebGLCubeRenderTarget(IS_MOBILE ? 64 : 128, {
  generateMipmaps: false,
  minFilter: THREE.LinearFilter,
});
const reflectionCamera = new THREE.CubeCamera(0.1, 50, reflectionRT);
scene.add(reflectionCamera);

// ─── Tunable params ──────────────────────────────────────────────────────────
const params = {
  // Colors
  bg:             '#fcfcfa',
  ambient:        1,
  keyLight:       3.6,
  fillLight:      5.45,

  // Camera — lifted up and pulled back so you look down at the pedestal.
  fov:     55,
  posX:    0, posY:    1.6, posZ:    4,
  lookX:   0, lookY: -1.0, lookZ:  -5,

  // Scene layout
  sceneZ:             -5,
  floorTargetY:       -1.4,
  floorRadius:         7,    // target world radius of the largest floor mesh
  sliderRadiusFactor:  1.0,  // >1 makes the slider wrap outside the floor edge
  logoExtraScale:      1.5,
  sliderFloorGap:      0.15,

  // Slider geometry
  slideHeight:  4,
  slideAspect:  16 / 9,
  slideArcGap:  0.03,

  // Floor material
  floorMetalness:      0.55,
  floorRoughness:      0.25,
  floorEnvIntensity:   0.45,

  // Fog overlay — pulled in so the slider's grazing-angle edges at the sides
  // of the viewport get covered (they render as thin slivers otherwise).
  fogInner:  40,
  fogOuter:  82,

  // Parallax / drag feel
  sliderParallax:     0.03,
  sliderFollowRate:   40,
  sliderFrictionRate: 2.2,
  mouseSmoothRate:    6,
  logoRotX:           0.30,
  logoRotY:           1.0,
  logoRotZ:           0.08,
  logoPos:            0.12,
  dragPxPerSlot:      900,

  // Logo resting orientation (degrees). Parallax rotation is added on top.
  logoBaseRotX:       0,
  logoBaseRotY:       90,
  logoBaseRotZ:       0,
};

// ─── Intro animation ─────────────────────────────────────────────────────────
// Sequential 3-act timeline.
//
//   Act 1 (color reveal + floor spin) — camera held above the logo, looking
//          straight down at the floor. The logo is hidden below the floor.
//          C3/C5/C7 sweep their color in while they spin in place.
//   Act 2 (camera move)               — camera lerps from top-down to its
//          final "side view" pose.
//   Act 3 (logo + pedestal rise +     — logo rises from below the floor,
//          slider fade-in & spin)       pedestal pieces lift to form the
//                                       staircase, slider fades to full and
//                                       its pre-spin decays.
let introStartTime = null; // ms timestamp of the first animate after GLB ready

const intro = {
  cameraInitialPos:  new THREE.Vector3(0, 8, params.sceneZ),
  cameraInitialLook: new THREE.Vector3(0, params.floorTargetY, params.sceneZ),
  cameraFinalPos:    new THREE.Vector3(params.posX, params.posY, params.posZ),
  cameraFinalLook:   new THREE.Vector3(params.lookX, params.lookY, params.lookZ),

  // Logo's starting Y offset (WORLD units) — well below the floor so the
  // logo is fully hidden under it before its rise stage starts.
  logoInitialOffsetY: -3.0,

  // Slider pre-rotation; decays to 0 during the slider stage.
  sliderInitialSpin: Math.PI * 6,

  stages: {
    colorReveal:  { start: 0.0, end: 2.5 },  // act 1
    floorSpin:    { start: 0.0, end: 2.5 },  // act 1
    cameraMove:   { start: 1.8, end: 3.4 },  // act 2 (snappier 0.9 s glide)
    logoRise:     { start: 3, end: 4.7 },  // act 3
    pedestalRise: { start: 3, end: 4.7 },  // act 3
    sliderFade:   { start: 3, end: 4.7 },  // act 3
    sliderSpin:   { start: 3, end: 4.9 },  // act 3 (slight tail)
  },
};

const stageProgress = (t, s) => Math.max(0, Math.min(1, (t - s.start) / (s.end - s.start)));
const easeOutQuad   = (t) => 1 - (1 - t) * (1 - t);
const easeOutCubic  = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuint  = (t) => 1 - Math.pow(1 - t, 5); // very fast start, very slow end
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const tmpV3a = new THREE.Vector3();
const tmpV3b = new THREE.Vector3();

// Measurements pulled from the GLB after it loads — used by applyLayout().
const layout = {
  ready:                false,
  measuredFloorRadius:  0,
  glbScale:             1, // params.floorRadius / measuredFloorRadius
  floorCenter:          new THREE.Vector3(),
  logoBboxMinY:         0,
  floorBboxMaxY:        0,
  floorMeshesByName:    {}, // 'Cylinder_1' → Mesh
};

// ─── Slider construction (rebuilds whenever its geometry changes) ────────────
const sliderGroup = new THREE.Group();
scene.add(sliderGroup);

// Video sources for the slider. Swap these for Cloudinary URLs later — the
// rest of the pipeline doesn't care where the URL points.
const VIDEO_URLS = [
  `${import.meta.env.BASE_URL}video-1.mp4`,
  `${import.meta.env.BASE_URL}video-2.mp4`,
];

// One <video> element + VideoTexture per source URL. All slides that share a
// URL share the texture (so they're frame-synced and cheap).
const videoTextures = VIDEO_URLS.map((url) => {
  const v = document.createElement('video');
  v.src         = url;
  v.crossOrigin = 'anonymous';
  v.loop        = true;
  v.muted       = true;
  v.playsInline = true;
  v.autoplay    = true;
  v.preload     = 'auto';
  v.play().catch((err) => console.warn('Video autoplay blocked:', err));

  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Anisotropic filtering keeps the video crisp at the glancing angles where
  // the curved slides recede toward the cylinder's edges.
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // The slide curving transform mirrors X, and we render BackSide; flipping
  // the texture's X sampling cancels that mirror so the video reads normally.
  tex.wrapS    = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  tex.offset.x = 1;
  return tex;
});

let slotArc = 1;        // populated by rebuildSlider()
let slideCount = 1;

// Shared "color fade" uniforms for every slide. The slides stay opaque (so
// they enter the transmission render pass and the glass logo always refracts
// them), and we instead mix their rendered color from the bg color (uFade=0)
// to the full texture (uFade=1) to do a smooth, transparency-free fade-in.
const sliderFadeUniforms = {
  uFade: { value: 0 },
  uBg:   { value: new THREE.Color(params.bg) },
};

function createCurvedSlide(centerAngle, arcWidth, height, radius, texture) {
  // 64 width segments → smoother silhouette where the slide curves away at
  // grazing angles (32 left visible faceting on close-up shots).
  const segments = 64;
  const geom = new THREE.PlaneGeometry(1, height, segments, 1);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const angle = centerAngle + (u - 0.5) * arcWidth;
    pos.setX(i, Math.sin(angle) * radius);
    pos.setZ(i, Math.cos(angle) * radius);
  }
  pos.needsUpdate = true;
  // No computeVertexNormals — MeshBasicMaterial is unlit, so normals are unused.
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
  // Inject a color-fade uniform so the slide can fade visually without ever
  // going transparent (transparent objects are excluded from transmission).
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sliderFadeUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>
         uniform float uFade;
         uniform vec3  uBg;`)
      .replace('#include <color_fragment>',
        `#include <color_fragment>
         diffuseColor.rgb = mix(uBg, diffuseColor.rgb, uFade);`);
  };
  return new THREE.Mesh(geom, mat);
}

function rebuildSlider() {
  while (sliderGroup.children.length) {
    const c = sliderGroup.children[0];
    sliderGroup.remove(c);
    c.geometry.dispose();
    c.material.dispose();
  }
  const radius = params.floorRadius * params.sliderRadiusFactor;
  const width  = params.slideHeight * params.slideAspect;
  const arc    = width / radius;
  slideCount = Math.max(1, Math.floor((Math.PI * 2) / (arc + params.slideArcGap)));
  slotArc = (Math.PI * 2) / slideCount;
  for (let i = 0; i < slideCount; i++) {
    const angle = Math.PI + i * slotArc;
    const tex   = videoTextures[i % videoTextures.length];
    sliderGroup.add(createCurvedSlide(angle, arc, params.slideHeight, radius, tex));
  }
}

// ─── Logo material (transmissive glass) ──────────────────────────────────────
// Native MeshPhysicalMaterial transmission: light passes through (refraction),
// `dispersion` splits RGB at the edges (chromatic aberration), `roughness`
// frosts it, and `envMap` (the floor cube cam) gives surface reflections.
const glassParams = {
  color:            '#fcfcfa',
  roughness:        0.1,
  ior:              1.2,
  thickness:        2,
  dispersion:       4.5,
  envMapIntensity:  1.2,
  attenuationColor: '#fcfcfa',
  attenuationDist:  3.0,
  clearcoat:        0,
  // Ice surface noise — set strengths to 0 to get smooth glass back.
  iceNormalStrength:  0.35,  // bumpiness of the surface (0 = smooth)
  iceRoughnessAmount: 0.35,  // how much noise modulates roughness (frost patches)
  iceNoiseScale:      9.0,   // texture frequency (higher = finer crystalline)
};

// Shared uniforms for the ice noise shader.
const iceUniforms = {
  uIceNormalStrength:  { value: glassParams.iceNormalStrength },
  uIceRoughnessAmount: { value: glassParams.iceRoughnessAmount },
  uIceNoiseScale:      { value: glassParams.iceNoiseScale },
};

function makeGlassMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color:               new THREE.Color(glassParams.color),
    metalness:           0.0,
    roughness:           glassParams.roughness,
    transmission:        1.0,
    ior:                 glassParams.ior,
    thickness:           glassParams.thickness,
    dispersion:          glassParams.dispersion,
    specularIntensity:   1.0,
    clearcoat:           glassParams.clearcoat,
    clearcoatRoughness:  0.12,
    envMap:              reflectionRT.texture,
    envMapIntensity:     glassParams.envMapIntensity,
    attenuationColor:    new THREE.Color(glassParams.attenuationColor),
    attenuationDistance: glassParams.attenuationDist,
    transparent:         true, // intro fades opacity 0 → 1
    opacity:             0,
  });
  // Inject procedural 3D noise into the lighting pass to perturb normals and
  // modulate roughness — gives the surface an icy / frosted crystalline look
  // without needing any textures.
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, iceUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        `#include <common>
         varying vec3 vIcePos;`)
      .replace('#include <begin_vertex>',
        `#include <begin_vertex>
         // Use mesh-local position so the noise sticks to the geometry as
         // the logo rotates with parallax.
         vIcePos = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>
         varying vec3 vIcePos;
         uniform float uIceNormalStrength;
         uniform float uIceRoughnessAmount;
         uniform float uIceNoiseScale;
         float iceHash(vec3 p) {
           p = fract(p * vec3(443.897, 441.423, 437.195));
           p += dot(p, p.yzx + 19.19);
           return fract((p.x + p.y) * p.z);
         }
         float iceNoise(vec3 p) {
           vec3 i = floor(p);
           vec3 f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(
             mix(mix(iceHash(i), iceHash(i + vec3(1,0,0)), f.x),
                 mix(iceHash(i + vec3(0,1,0)), iceHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(iceHash(i + vec3(0,0,1)), iceHash(i + vec3(1,0,1)), f.x),
                 mix(iceHash(i + vec3(0,1,1)), iceHash(i + vec3(1,1,1)), f.x), f.y),
             f.z);
         }`)
      .replace('#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         // Perturb the surface normal with 3D noise at two octaves so the
         // refraction breaks up the way ice does.
         vec3 nP = vIcePos * uIceNoiseScale;
         vec3 nOff = vec3(
           iceNoise(nP + vec3(1.7, 0.0, 0.0)) - iceNoise(nP - vec3(1.7, 0.0, 0.0)),
           iceNoise(nP + vec3(0.0, 1.7, 0.0)) - iceNoise(nP - vec3(0.0, 1.7, 0.0)),
           iceNoise(nP + vec3(0.0, 0.0, 1.7)) - iceNoise(nP - vec3(0.0, 0.0, 1.7))
         );
         normal = normalize(normal + nOff * uIceNormalStrength);`)
      .replace('#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         // Roughness variance — some patches are more frosted, some clearer.
         float rN = iceNoise(vIcePos * uIceNoiseScale * 0.35);
         roughnessFactor = clamp(
           roughnessFactor + (rN - 0.5) * uIceRoughnessAmount,
           0.0, 1.0
         );`);
  };
  return mat;
}
const logoMaterial = makeGlassMaterial();

// ─── Floor material with angular (sweep) reveal ──────────────────────────────
// All floor pieces share uFillAngle (0..2π) and uRevealCenter; each one has its
// own uFillOffset to stagger where its sweep begins, like progress arcs.
const revealUniforms = {
  uRevealCenter: { value: new THREE.Vector3(0, 0, params.sceneZ) },
  uFillAngle:    { value: 0 }, // current arc that's revealed (radians)
  uBaseColor:    { value: new THREE.Color(params.bg) },
};

function makeFloorMaterial(color, offsetRad = 0) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness:       params.floorMetalness,
    roughness:       params.floorRoughness,
    envMap:          reflectionRT.texture,
    envMapIntensity: params.floorEnvIntensity,
  });
  mat.userData.fill = { uFillOffset: { value: offsetRad } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, revealUniforms);
    Object.assign(shader.uniforms, mat.userData.fill);
    // Use the LOCAL vertex position (XZ) for the fill angle. That way the
    // painted arc lives on the mesh and rotates with it — so when we spin
    // the mesh you actually see the arc moving.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nvarying vec2 vFloorLocalXZ;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvFloorLocalXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>
         #define TAU 6.28318530718
         varying vec2 vFloorLocalXZ;
         uniform float uFillAngle;
         uniform float uFillOffset;
         uniform vec3  uBaseColor;`)
      .replace('#include <color_fragment>',
        `#include <color_fragment>
         float a = atan(vFloorLocalXZ.y, vFloorLocalXZ.x);
         float rel = mod(a - uFillOffset + TAU, TAU);
         float filled = 1.0 - smoothstep(uFillAngle - 0.05, uFillAngle + 0.05, rel);
         diffuseColor.rgb = mix(uBaseColor, diffuseColor.rgb, filled);`);
  };
  return mat;
}

// ─── Logo + floor + pedestal groups ──────────────────────────────────────────
const logoGroup     = new THREE.Group();
const floorGroup    = new THREE.Group();
const pedestalGroup = new THREE.Group();
const logoBase      = new THREE.Vector3();
const floorBase     = new THREE.Vector3();
scene.add(logoGroup, floorGroup, pedestalGroup);

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

// ─── Update functions (apply current params to the live scene) ──────────────
function applyCamera() {
  camera.fov = params.fov;
  camera.position.set(params.posX, params.posY, params.posZ);
  camera.lookAt(params.lookX, params.lookY, params.lookZ);
  camera.updateProjectionMatrix();
}

function applyLights() {
  scene.children.forEach((c) => {
    if (c.isAmbientLight) c.intensity = params.ambient;
  });
  keyLight.intensity  = params.keyLight;
  fillLight.intensity = params.fillLight;
}

function applyColors() {
  scene.background.set(params.bg);
  revealUniforms.uBaseColor.value.set(params.bg);
  sliderFadeUniforms.uBg.value.set(params.bg);

  for (const [name, mesh] of Object.entries(layout.floorMeshesByName)) {
    const c = FLOOR_COLOR_MAP[name];
    if (c) mesh.material.color.set(c);
  }
  applyFog();
}

function applyFog() {
  const overlay = document.querySelector('.edge-fog');
  if (!overlay) return;
  const c = new THREE.Color(params.bg);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  overlay.style.background =
    `radial-gradient(circle at center,` +
    ` rgba(${r}, ${g}, ${b}, 0) ${params.fogInner}%,` +
    ` rgba(${r}, ${g}, ${b}, 1) ${params.fogOuter}%)`;
}

// ─── Per-mesh setup (declared above applyLayout because it references it) ────
// Final floor colors. Anything left at the bg color is intentionally invisible
// against the background; those rings exist just to receive pedestal lift.
const FLOOR_COLOR_MAP = {
  C1: '#fcfcfa',
  C2: '#fcfcfa',
  C3: '#35df7e',
  C4: '#fcfcfa',
  C5: '#6299dd',
  C6: '#fcfcfa',
  C7: '#6299dd',
  C8: '#fcfcfa',
};

// Direction + magnitude of pre-spin for each animated ring. Sign sets the
// direction; magnitude controls how many radians of pre-rotation it eats
// during the spin stage. C3 + C7 spin the same way, C5 spins opposite.
const SPIN_PRE_ROTATION = {
  C3: +Math.PI * 1.8,
  C5: -Math.PI * 1.8,
  C7: +Math.PI * 1.8,
};

// How much each ring rises during the pedestal stage, in WORLD UNITS. C8 is
// the ground (no rise). C7+C6 form tier 1. C5+C4 join C1+C2+C3 at the top
// tier. Values are scaled to mesh-local at assignment time (divide by glbScale).
const PEDESTAL_LIFT_MAP = {
  C1: 0.28,
  C2: 0.28,
  C3: 0.28,
  C4: 0.28,
  C5: 0.28,
  C6: 0.13,
  C7: 0.13,
  C8: 0,
};
// Max pedestal lift (world units) — slider Y, logo Y, and reflection camera Y
// all sit above this value.
const topLift = () => {
  let max = 0;
  for (const v of Object.values(PEDESTAL_LIFT_MAP)) if (v > max) max = v;
  return max;
};

// applyLayout positions the GLB groups (floor / pedestal / logo). The slider
// and reflection camera positions are owned by the animate() loop so they can
// track the per-frame pedestal lift cleanly.
function applyLayout() {
  if (!layout.ready) return;

  const measured = layout.measuredFloorRadius || 1; // guard against divide-by-zero
  const glbScale = params.floorRadius / measured;
  layout.glbScale = glbScale;
  floorGroup.scale.setScalar(glbScale);
  pedestalGroup.scale.setScalar(glbScale);
  logoGroup.scale.setScalar(glbScale * params.logoExtraScale);

  const yShift = params.floorTargetY - layout.floorBboxMaxY * glbScale;
  // Keep the logo bottom anchored where it would be without the extra scale.
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
  pedestalGroup.position.copy(floorBase);
  logoGroup.position.copy(logoBase); // animate() will overwrite Y each frame
}

// ─── Initial application ─────────────────────────────────────────────────────
rebuildSlider();
applyCamera();
applyLights();
applyColors();
applyLayout();

// ─── GLB load ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

loader.load(`${import.meta.env.BASE_URL}test_2_updated.glb`, (gltf) => {
  gltf.scene.updateMatrixWorld(true);

  const meshInfos = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const worldBox = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    meshInfos.push({ mesh: o, worldBox });
  });
  if (meshInfos.length === 0) return;

  // Classify: logo / floor cylinders (C1..C8 etc.) / everything else.
  const logoMeshes     = [];
  const floorMeshes    = [];
  const pedestalMeshes = [];
  for (const info of meshInfos) {
    const name = info.mesh.name || '';
    if (/logo|curve/i.test(name))                 logoMeshes.push(info.mesh);
    else if (/^(?:C|Cylinder)_?\d+$/i.test(name)) floorMeshes.push(info.mesh);
    else                                          pedestalMeshes.push(info.mesh);
  }
  floorMeshes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (logoMeshes.length === 0 && pedestalMeshes.length > 0) {
    pedestalMeshes.sort((a, b) =>
      meshInfos.find((i) => i.mesh === b).worldBox.max.y -
      meshInfos.find((i) => i.mesh === a).worldBox.max.y
    );
    logoMeshes.push(pedestalMeshes.shift());
  }

  floorMeshes.forEach((m, i) => {
    const c   = FLOOR_COLOR_MAP[m.name] ?? params.bg;
    const off = (i / Math.max(1, floorMeshes.length)) * Math.PI * 2 + Math.PI / 2;
    m.material = makeFloorMaterial(c, off);
    layout.floorMeshesByName[m.name] = m;
  });
  pedestalMeshes.forEach((m) => { m.material = logoMaterial; });

  const logoBbox  = bakeIntoGroup(logoMeshes,     logoGroup,     logoMaterial);
  const floorBbox = bakeIntoGroup(floorMeshes,    floorGroup,    null);
                    bakeIntoGroup(pedestalMeshes, pedestalGroup, null);

  if (!logoBbox.isEmpty()) layout.logoBboxMinY = logoBbox.min.y;
  if (!floorBbox.isEmpty()) {
    layout.measuredFloorRadius = Math.max(
      floorBbox.max.x - floorBbox.min.x,
      floorBbox.max.z - floorBbox.min.z
    ) / 2;
    floorBbox.getCenter(layout.floorCenter);
    layout.floorBboxMaxY = floorBbox.max.y;
  }
  applyLayout();

  // Top-down intro start, centered on the (possibly off-origin) logo.
  intro.cameraInitialPos.set(logoBase.x, 8, logoBase.z);
  intro.cameraInitialLook.set(logoBase.x, params.floorTargetY, logoBase.z);

  layout.ready = true;
  // Warm up the heavy glass transmission shader off the critical path.
  renderer.compileAsync(scene, camera).catch(() => {});
}, undefined, (err) => console.error('GLB load failed:', err));

// ─── Input ───────────────────────────────────────────────────────────────────
let sliderTarget = 0, sliderRotation = 0, sliderVelocity = 0;
let isDragging = false;
let dragStartX = 0, dragStartTarget = 0;
let lastPointerX = 0, lastPointerTime = 0;
let mouseX = 0, mouseY = 0, mouseXs = 0, mouseYs = 0;

const canvasEl = renderer.domElement;

canvasEl.addEventListener('pointerdown', (e) => {
  isDragging = true;
  canvasEl.setPointerCapture(e.pointerId);
  dragStartX = e.clientX;
  dragStartTarget = sliderTarget;
  lastPointerX = e.clientX;
  lastPointerTime = performance.now();
  sliderVelocity = 0;
});

window.addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;

  if (isDragging) {
    const sensitivity = slotArc / params.dragPxPerSlot;
    const dx = e.clientX - dragStartX;
    sliderTarget = dragStartTarget + dx * sensitivity;

    const now = performance.now();
    const dt = (now - lastPointerTime) / 1000;
    if (dt > 0) sliderVelocity = ((e.clientX - lastPointerX) * sensitivity) / dt;
    lastPointerX = e.clientX;
    lastPointerTime = now;
  }
});

function endDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  try { canvasEl.releasePointerCapture(e.pointerId); } catch {}
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
// Reflection cube map updates every Nth frame — heavier throttle on mobile.
const REFLECT_EVERY = IS_MOBILE ? 4 : 2;
let reflectFrame = 0;
// Pause the loop when the tab is hidden so we don't burn battery offscreen.
let pageVisible = !document.hidden;
document.addEventListener('visibilitychange', () => {
  pageVisible = !document.hidden;
  if (pageVisible) clock.getDelta(); // reset dt so we don't get a giant first delta
});

function animate() {
  requestAnimationFrame(animate);
  if (!pageVisible) return;
  const dt = Math.min(clock.getDelta(), 1 / 30);

  // ─── Intro timeline (always running — each stage clamps its own progress) ──
  if (layout.ready && introStartTime === null) introStartTime = performance.now();
  const t = layout.ready ? (performance.now() - introStartTime) / 1000 : 0;

  // Stage progressions (each clamped to [0, 1]).
  const revealP   = easeOutQuint(stageProgress(t, intro.stages.colorReveal));
  const spinP     = easeOutQuint(stageProgress(t, intro.stages.floorSpin));
  const camP      = easeInOutCubic(stageProgress(t, intro.stages.cameraMove));
  const logoP     = easeOutCubic(stageProgress(t, intro.stages.logoRise));
  const pedP      = easeOutCubic(stageProgress(t, intro.stages.pedestalRise));
  const fadeP     = easeOutQuad(stageProgress(t, intro.stages.sliderFade));
  const sliderSpP = easeOutQuint(stageProgress(t, intro.stages.sliderSpin));

  // Logo opacity — quick fade-in pinned to the first 40% of the rise.
  const logoFadeRange = intro.stages.logoRise.end - intro.stages.logoRise.start;
  const logoOpacityP = stageProgress(t, {
    start: intro.stages.logoRise.start,
    end:   intro.stages.logoRise.start + logoFadeRange * 0.4,
  });
  logoMaterial.opacity = easeOutQuad(logoOpacityP);

  // ─── Act 1 — color reveal on C3/C5/C7 + per-mesh spin ──────────────────────
  revealUniforms.uFillAngle.value = lerp(0, Math.PI * 2 + 0.2, revealP);
  if (layout.ready) {
    for (const [name, preRot] of Object.entries(SPIN_PRE_ROTATION)) {
      const mesh = layout.floorMeshesByName[name];
      if (mesh) mesh.rotation.y = lerp(preRot, 0, spinP);
    }
  }

  // ─── Act 2 — camera lerp (top-down → final) ────────────────────────────────
  tmpV3a.lerpVectors(intro.cameraInitialPos,  intro.cameraFinalPos,  camP);
  tmpV3b.lerpVectors(intro.cameraInitialLook, intro.cameraFinalLook, camP);
  camera.position.copy(tmpV3a);
  camera.lookAt(tmpV3b);

  // ─── Act 3 — pedestal rise, logo rise, slider fade + spin ──────────────────
  // Pedestal — values in PEDESTAL_LIFT_MAP are WORLD units; mesh.position.y is
  // mesh-local, so we divide by glbScale (the floor group's scale).
  if (layout.ready) {
    for (const [name, worldLift] of Object.entries(PEDESTAL_LIFT_MAP)) {
      const mesh = layout.floorMeshesByName[name];
      if (mesh) mesh.position.y = (worldLift * pedP) / layout.glbScale;
    }
  }
  sliderFadeUniforms.uFade.value = fadeP;
  // Hidden until its fade stage starts — uFade=0 leaves the slides as bg
  // color but the silhouettes still occlude things at grazing angles. Just
  // skip rendering them entirely until the stage begins.
  sliderGroup.visible = layout.ready && t >= intro.stages.sliderFade.start;
  const introSliderSpin = lerp(intro.sliderInitialSpin, 0, sliderSpP);
  const introLogoOffset = lerp(intro.logoInitialOffsetY, 0, logoP);
  const liftWorld = topLift() * pedP; // world units already

  // Slider + reflection camera follow the lifted floor every frame so the
  // slider always sits exactly sliderFloorGap above the floor's top tier.
  sliderGroup.position.set(
    0,
    params.floorTargetY + liftWorld + params.sliderFloorGap + params.slideHeight / 2,
    params.sceneZ
  );
  reflectionCamera.position.set(
    0,
    params.floorTargetY + liftWorld + 0.05,
    params.sceneZ
  );

  // ─── Drag inertia + mouse smoothing ────────────────────────────────────────
  if (!isDragging) {
    sliderTarget += sliderVelocity * dt;
    sliderVelocity *= Math.exp(-params.sliderFrictionRate * dt);
    if (Math.abs(sliderVelocity) < 1e-4) sliderVelocity = 0;
  }
  sliderRotation = damp(sliderRotation, sliderTarget, params.sliderFollowRate, dt);
  mouseXs = damp(mouseXs, mouseX, params.mouseSmoothRate, dt);
  mouseYs = damp(mouseYs, mouseY, params.mouseSmoothRate, dt);

  sliderGroup.rotation.y = sliderRotation + (-mouseXs * params.sliderParallax) + introSliderSpin;

  // ─── Logo transform — base + intro offsets + parallax ──────────────────────
  const DEG = Math.PI / 180;
  logoGroup.rotation.x = params.logoBaseRotX * DEG + (-mouseYs * params.logoRotX);
  logoGroup.rotation.y = params.logoBaseRotY * DEG + ( mouseXs * params.logoRotY);
  logoGroup.rotation.z = params.logoBaseRotZ * DEG + ( mouseXs * params.logoRotZ);
  logoGroup.position.x = logoBase.x + mouseXs * params.logoPos;
  logoGroup.position.y = logoBase.y + introLogoOffset + liftWorld - mouseYs * params.logoPos;

  // Refresh floor reflections at the throttled rate — hide self-referencing
  // objects so the floor doesn't appear in its own reflection.
  if (layout.ready && (reflectFrame++ % REFLECT_EVERY) === 0) {
    floorGroup.visible    = false;
    pedestalGroup.visible = false;
    logoGroup.visible     = false;
    reflectionCamera.update(renderer, scene);
    floorGroup.visible    = true;
    pedestalGroup.visible = true;
    logoGroup.visible     = true;
  }

  renderer.render(scene, camera);
}
animate();
