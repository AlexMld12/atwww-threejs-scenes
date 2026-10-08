import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { AnimationPointerPlugin } from './animation-pointer';
import { HERO_ASSETS, HERO_MODEL, LOOK, POSE_CORRECTION, type Look } from './config';
import { createLut, installFilmic, type LutInfo } from './filmic';
import { createPostprocessing, type Compositor } from './postprocessing';
import { clearCapTransmission } from './transmission';
import { fetchWithProgress, finishTask, reportProgress } from '@/lib/preload';

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

export interface HeroScene {
  duration: number;
  /** Re-applies LOOK after it was changed at runtime (the dev tuning hook). */
  applyLook(): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  setTime(seconds: number): void;
  render(): void;
  dispose(): void;
}

type LitMaterial = THREE.MeshPhysicalMaterial;

const FOAM_WIDTH = 0.045;
const BOUNCE_ANGLES = [180, 240, 300];
const FOAM_HEIGHT = 0.15;

const capEdge: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2() };
// Fresnel-weighted emission: brightest where the cap's walls are seen edge-on.
const CAP_EDGE_GLOW = `#include <emissivemap_fragment>
  totalEmissiveRadiance += capEdge.x * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), capEdge.y);`;

const lutUniform: THREE.IUniform<THREE.Data3DTexture | null> = { value: null };
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
  finishTask('hero-data');

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((parser) => new AnimationPointerPlugin(parser));
  const [gltf, lutBuffer] = await Promise.all([
    loader
      .loadAsync(HERO_ASSETS + HERO_MODEL, (event) => {
        if (event.total) reportProgress('hero-model', event.loaded / event.total);
      })
      .finally(() => finishTask('hero-model')),
    fetchWithProgress(HERO_ASSETS + lutInfo.file, 'hero-lut').then((blob) => blob.arrayBuffer()),
  ]);

  installFilmic(lutInfo);
  RectAreaLightUniformsLib.init();

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.CustomToneMapping;

  const lut = createLut(lutBuffer, lutInfo);

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
  const capMaterials: LitMaterial[] = [];
  const baseRoughness = new Map<LitMaterial, number>();
  const lifted = Object.keys(LOOK.lift).map((product) => ({
    product: product as keyof Look['lift'],
    materials: [] as LitMaterial[],
  }));
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  for (const material of materials) {
    const isCap = material.name.endsWith('Cap_Clear');
    if (manifest.glowMaterials.includes(material.name)) glowMaterials.push(material);
    if (isCap) capMaterials.push(material);
    else baseRoughness.set(material, material.roughness);
    const lift = lifted.find(({ product }) => material.name.includes(product));
    if (lift && !isCap) {
      lift.materials.push(material);
      material.emissive.copy(material.color);
      material.emissiveMap = material.map;
    }
    for (const value of Object.values(material)) {
      if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).anisotropy = maxAnisotropy;
    }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.heroLUT = lutUniform;
      if (isCap) {
        shader.uniforms.capEdge = capEdge;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <transmission_pars_fragment>', clearCapTransmission)
          .replace('void main() {', `uniform vec2 capEdge;\nvoid main() {`)
          .replace('#include <emissivemap_fragment>', CAP_EDGE_GLOW);
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

  const studioLights = manifest.lights
    .filter((l) => l.enabled && !l.background_only)
    .map((light) => {
      const area = new THREE.RectAreaLight(new THREE.Color().setRGB(...light.color), 0, light.width, light.height);
      area.position.fromArray(light.position);
      area.quaternion.fromArray(light.quaternion);
      scene.add(area);
      const base = light.watts / (Math.PI * light.width * light.height);
      return { area, base, control: light.name.endsWith('Rim_R') ? ('rim' as const) : ('top' as const) };
    });

  const fillLights = LOOK.fills.map(() => new THREE.RectAreaLight(0xffffff, 0, 1, 1));
  if (fillLights.length) scene.add(...fillLights);

  const foamNode = gltf.scene.getObjectByName('K1_COOL_Foam');
  if (!foamNode) throw new Error('K1_COOL_Foam missing');
  const foam: THREE.Object3D = foamNode;

  // K1's light onto the serum, from the side of its body that faces it. Each area light lengthens every shader.
  const forward = new THREE.Vector3(0, 0, -1);
  const bounceLights = BOUNCE_ANGLES.map((degrees) => {
    const angle = THREE.MathUtils.degToRad(degrees);
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const light = new THREE.RectAreaLight(0xffffff, 0, 0.021, 0.094);
    light.position.copy(direction).multiplyScalar(0.0201);
    light.position.y = -0.0303;
    light.quaternion.setFromUnitVectors(forward, direction);
    return light;
  });
  foam.add(...bounceLights);

  const foamCentre = new THREE.Vector3();
  const neighbourCentre = new THREE.Vector3();
  const glowLights = (Object.keys(LOOK.glowLights) as (keyof Look['glowLights'])[]).map((name) => {
    const target = gltf.scene.getObjectByName(name);
    if (!target) throw new Error(`${name} missing`);
    const light = new THREE.RectAreaLight(0xffffff, 0, FOAM_WIDTH, FOAM_HEIGHT);
    scene.add(light);
    return { name, target, light };
  });

  function aimGlowLights() {
    new THREE.Box3().setFromObject(foam).getCenter(foamCentre);
    for (const { target, light } of glowLights) {
      new THREE.Box3().setFromObject(target).getCenter(neighbourCentre);
      const towards = neighbourCentre.clone().sub(foamCentre).normalize();
      light.position.copy(foamCentre).addScaledVector(towards, FOAM_WIDTH / 2);
      light.lookAt(neighbourCentre);
    }
  }

  // ---- animation ----
  const clip = gltf.animations.find((a) => a.name === 'HERO_Full');
  if (!clip) throw new Error('HERO_Full clip missing');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const glowTrack = clip.tracks.find((t) => t.name.endsWith('material.emissiveIntensity'));
  if (!glowTrack) throw new Error('K1 light-up animation missing');
  const glowCurve =
    glowTrack.getInterpolation() === THREE.InterpolateDiscrete
      ? glowTrack.InterpolantFactoryMethodDiscrete()
      : glowTrack.InterpolantFactoryMethodLinear();

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
    // Undo the last correction first: the mixer skips nodes whose value did not change.
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

    scene.updateMatrixWorld(true);
    aimGlowLights();
    updateGlow();
    scene.updateMatrixWorld(true);
  }

  // After the mixer, which only writes values that changed.
  function updateGlow() {
    const glow = glowCurve.evaluate(Math.max(0, time))[0] * LOOK.emission;
    for (const m of glowMaterials) m.emissiveIntensity = glow;
    for (const l of bounceLights) l.intensity = glow * LOOK.bounce;
    for (const { name, light } of glowLights) light.intensity = glow * LOOK.glowLights[name];
  }

  function applyLook() {
    renderer.toneMappingExposure = 2 ** LOOK.exposure;
    scene.environmentIntensity = manifest.world.strength * LOOK.ambient;
    for (const { area, base, control } of studioLights) area.intensity = base * LOOK[control];
    const { fills, cap } = LOOK;
    fills.forEach((fill, i) => {
      const light = fillLights[i];
      light.intensity = fill.intensity;
      light.width = light.height = fill.size;
      light.position.fromArray(fill.position);
      light.lookAt(...fill.target);
    });
    for (const [material, roughness] of baseRoughness) material.roughness = Math.min(1, roughness * LOOK.roughness);
    for (const material of capMaterials) {
      material.roughness = cap.roughness;
      material.transmission = cap.transmission;
      material.ior = cap.ior;
      material.thickness = cap.thickness / 1000;
      material.specularIntensity = cap.reflectivity;
      material.color.set(cap.tint);
      material.emissive.set(0xffffff);
      material.emissiveIntensity = cap.glow;
      capEdge.value.set(cap.edge, cap.edgePower);
    }
    for (const { product, materials: list } of lifted) {
      for (const material of list) material.emissiveIntensity = LOOK.lift[product];
    }
    for (const material of glowMaterials) material.emissive.set(LOOK.emissionColor);
    for (const light of bounceLights) light.color.set(LOOK.emissionColor);
    scene.updateMatrixWorld(true);
    aimGlowLights();
    updateGlow();
    scene.updateMatrixWorld(true);
  }

  setTime(0);
  applyLook();
  lutUniform.value = lut;
  await post.compile(scene, camera);
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if ((value as THREE.Texture | null)?.isTexture) renderer.initTexture(value as THREE.Texture);
    }
  }
  renderer.initTexture(lut);
  finishTask('hero-compile');

  return {
    duration: manifest.duration,
    applyLook,

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
