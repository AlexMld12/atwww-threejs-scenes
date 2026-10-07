import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { AnimationPointerPlugin } from './animation-pointer';
import { HERO_ASSETS, HERO_MODEL, LOOK, POSE_CORRECTION } from './config';
import { createPostprocessing, type Compositor } from './postprocessing';

interface Manifest {
  duration: number;
  world: { linearColor: [number, number, number]; strength: number };
  lights: {
    name: string;
    watts: number;
    color: [number, number, number];
    width: number;
    height: number;
    position: [number, number, number];
    quaternion: [number, number, number, number];
    background_only: boolean;
    enabled: boolean;
  }[];
  glowMaterials: string[];
}

interface LutInfo {
  file: string;
  size: number;
  log2min: number;
  log2max: number;
}

export interface HeroScene {
  duration: number;
  setSize(width: number, height: number, pixelRatio: number): void;
  setTime(seconds: number): void;
  render(): void;
  dispose(): void;
}

type LitMaterial = THREE.MeshPhysicalMaterial;

const lutUniform: THREE.IUniform<THREE.Data3DTexture | null> = { value: null };
let filmicInstalled = false;

/** Replaces three's CustomToneMapping with Blender's Filmic / Very High Contrast LUT. */
function installFilmic(info: LutInfo) {
  if (filmicInstalled) return;
  const n = info.size;
  const range = info.log2max - info.log2min;
  const filmic = `vec3 CustomToneMapping( vec3 color ) {
    vec3 p = (clamp(log2(max(color * toneMappingExposure, vec3(0.0000001))), ${info.log2min.toFixed(1)}, ${info.log2max.toFixed(1)}) - (${info.log2min.toFixed(1)})) / ${range.toFixed(1)};
    return texture(heroLUT, p * ${((n - 1) / n).toFixed(10)} + ${(0.5 / n).toFixed(10)}).rgb;
  }`;
  const original = THREE.ShaderChunk.tonemapping_pars_fragment;
  const patched = original.replace(/vec3 CustomToneMapping\(\s*vec3 color\s*\)\s*\{[^}]*\}/, filmic);
  if (patched === original) throw new Error('three.js tone-mapping chunk changed; recheck the Filmic hook');
  THREE.ShaderChunk.tonemapping_pars_fragment = `uniform highp sampler3D heroLUT;\n${patched}`;
  filmicInstalled = true;
}

/**
 * three r186 clears the transmission target to white at alpha 0.5. Removing that matte lets
 * the hollow cap composite over the page background instead of a grey box.
 */
const clearCapTransmission = THREE.ShaderChunk.transmission_pars_fragment
  .replace(
    'vec3 attenuatedColor = transmittance * transmittedLight.rgb;',
    `transmittedLight.rgb = max(vec3(0.0), transmittedLight.rgb - vec3(1.0 - transmittedLight.a));
    transmittedLight.a = clamp(2.0 * transmittedLight.a - 1.0, 0.0, 1.0);
    vec3 attenuatedColor = transmittance * transmittedLight.rgb;`,
  )
  .replace(
    '1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor',
    '1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor * (1.0 - max(F.r, max(F.g, F.b)))',
  );

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(HERO_ASSETS + name);
  if (!response.ok) throw new Error(`${name} unavailable`);
  return response.json();
}

export async function createHeroScene(canvas: HTMLCanvasElement): Promise<HeroScene> {
  const [manifest, lutInfo, compositor] = await Promise.all([
    fetchJson<Manifest>('scene_manifest.json'),
    fetchJson<LutInfo>('filmic_lut.json'),
    fetchJson<Compositor>('compositor.json'),
  ]);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((parser) => new AnimationPointerPlugin(parser));
  const [gltf, lutBuffer] = await Promise.all([
    loader.loadAsync(HERO_ASSETS + HERO_MODEL),
    fetch(HERO_ASSETS + lutInfo.file).then((r) => {
      if (!r.ok) throw new Error('Filmic LUT unavailable');
      return r.arrayBuffer();
    }),
  ]);

  installFilmic(lutInfo);
  RectAreaLightUniformsLib.init();

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 2 ** LOOK.exposure;

  const lut = new THREE.Data3DTexture(new Uint16Array(lutBuffer), lutInfo.size, lutInfo.size, lutInfo.size);
  lut.format = THREE.RGBAFormat;
  lut.type = THREE.HalfFloatType;
  lut.minFilter = lut.magFilter = THREE.LinearFilter;
  lut.unpackAlignment = 1;
  lut.needsUpdate = true;

  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const camera = gltf.cameras[0] as THREE.PerspectiveCamera | undefined;
  if (!camera) throw new Error('Animated camera missing');

  // ---- materials ----
  const materials = new Set<LitMaterial>();
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) for (const m of [mesh.material].flat()) materials.add(m as LitMaterial);
  });
  const glowMaterials: LitMaterial[] = [];
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  for (const material of materials) {
    const isCap = material.name.endsWith('Cap_Clear');
    if (manifest.glowMaterials.includes(material.name)) {
      glowMaterials.push(material);
      material.emissive.set(LOOK.emissionColor);
    }
    if (isCap) {
      const { cap } = LOOK;
      material.roughness = cap.roughness;
      material.transmission = cap.transmission;
      material.ior = cap.ior;
      material.thickness = cap.thickness / 1000;
      material.specularIntensity = cap.reflectivity;
      material.color.set(cap.tint);
    }
    for (const value of Object.values(material)) {
      if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).anisotropy = maxAnisotropy;
    }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.heroLUT = lutUniform;
      if (isCap) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_pars_fragment>', clearCapTransmission);
      }
    };
    material.customProgramCacheKey = () => (isCap ? 'kelv-hero-cap' : 'kelv-hero');
  }

  // ---- lighting ----
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color().setRGB(...manifest.world.linearColor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0, 0.001, 10);
  scene.environment = environment.texture;
  scene.environmentIntensity = manifest.world.strength * LOOK.ambient;

  for (const light of manifest.lights.filter((l) => l.enabled && !l.background_only)) {
    const strength = light.name.endsWith('Rim_R') ? LOOK.rim : LOOK.top;
    const area = new THREE.RectAreaLight(
      new THREE.Color().setRGB(...light.color),
      (light.watts / (Math.PI * light.width * light.height)) * strength,
      light.width,
      light.height,
    );
    area.position.fromArray(light.position);
    area.quaternion.fromArray(light.quaternion);
    scene.add(area);
  }

  const { fill } = LOOK;
  const fillLight = new THREE.RectAreaLight(0xffffff, fill.intensity, fill.size, fill.size);
  fillLight.position.fromArray(fill.position);
  fillLight.lookAt(...fill.target);
  scene.add(fillLight);

  // K1's light onto its neighbours, approximated by small area lights around its body.
  const foam = gltf.scene.getObjectByName('K1_COOL_Foam');
  if (!foam) throw new Error('K1_COOL_Foam missing');
  const bounceLights: THREE.RectAreaLight[] = [];
  const forward = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const light = new THREE.RectAreaLight(LOOK.emissionColor, 0, 0.021, 0.094);
    light.position.copy(direction).multiplyScalar(0.0201);
    light.position.y = -0.0303;
    light.quaternion.setFromUnitVectors(forward, direction);
    bounceLights.push(light);
  }
  for (const y of [-0.0773, 0.0167]) {
    const light = new THREE.RectAreaLight(LOOK.emissionColor, 0, 0.035, 0.035);
    light.position.y = y;
    light.quaternion.setFromUnitVectors(forward, new THREE.Vector3(0, Math.sign(y), 0));
    bounceLights.push(light);
  }
  foam.add(...bounceLights);

  // ---- animation ----
  const clip = gltf.animations.find((a) => a.name === 'HERO_Full');
  if (!clip) throw new Error('HERO_Full clip missing');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  if (!clip.tracks.some((t) => t.name.endsWith('material.emissiveIntensity'))) {
    throw new Error('K1 light-up animation missing');
  }

  const corrections = Object.entries(POSE_CORRECTION).map(([name, { position, rotation }]) => {
    const node = gltf.scene.getObjectByName(name);
    if (!node) throw new Error(`${name} missing`);
    const rotate = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    return { node, offset: new THREE.Vector3(...position), rotate, unrotate: rotate.clone().invert() };
  });

  const post = createPostprocessing(renderer, lut, compositor);
  const referenceAspect = camera.aspect;
  const baseFov = camera.fov;
  let time = -1;

  function setTime(seconds: number) {
    const t = THREE.MathUtils.clamp(seconds, 0, manifest.duration);
    if (t === time) return;
    // The mixer skips nodes whose sampled value did not change, so the previous correction
    // is undone first instead of assuming the animation overwrote it.
    if (time >= 0) {
      for (const c of corrections) {
        c.node.position.sub(c.offset);
        c.node.quaternion.premultiply(c.unrotate);
      }
    }
    time = t;
    mixer.setTime(t);
    for (const c of corrections) {
      c.node.position.add(c.offset);
      c.node.quaternion.premultiply(c.rotate);
    }

    // The mixer animates the glow materials' emissiveIntensity; the bounce lights follow it.
    const glow = glowMaterials[0]?.emissiveIntensity ?? 0;
    for (const l of bounceLights) l.intensity = glow * LOOK.bounce;
    scene.updateMatrixWorld(true);
  }

  setTime(0);
  lutUniform.value = lut;
  await renderer.compileAsync(scene, camera);

  return {
    duration: manifest.duration,

    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      post.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      // Wider than the reference keeps the vertical framing; narrower widens the view.
      camera.aspect = width / height;
      const scale = Math.max(1, referenceAspect / camera.aspect);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * scale));
      camera.updateProjectionMatrix();
    },

    setTime,

    render() {
      lutUniform.value = lut;
      post.render(scene, camera, LOOK);
    },

    dispose() {
      const textures = new Set<THREE.Texture>();
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
        }
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
      mixer.stopAllAction();
      post.dispose();
      lut.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
