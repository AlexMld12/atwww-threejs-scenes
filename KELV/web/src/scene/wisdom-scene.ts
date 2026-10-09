import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { HERO_ASSETS } from './config';
import { createLut, installFilmic, type LutInfo } from './filmic';
import { createPostprocessing, type Compositor } from './postprocessing';
import { clearCapTransmission } from './transmission';
import { MOTION_PIVOT, WISDOM_ASSETS, WISDOM_LOOK, WISDOM_MODEL } from './wisdom-config';
import { fetchWithProgress, finishTask, reportProgress } from '@/lib/preload';

interface Manifest {
  duration: number;
  fps: number;
  samples: number;
  clip: string;
  camera: { aspectRatio: number; yfov: number; shiftX: number; shiftY: number };
  world: { linearColor: [number, number, number]; strength: number };
  productNodes: string[];
  lights: {
    name: string;
    control: string;
    width: number;
    height: number;
    color: [number, number, number];
    targetGroup: 'products' | 'all';
    power: number[];
  }[];
}

export interface WisdomScene {
  duration: number;
  /** Re-applies WISDOM_LOOK after it was changed at runtime (the dev tuning hook). */
  applyLook(): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  setTime(seconds: number): void;
  render(): void;
  dispose(): void;
}

type Group = 'products' | 'props';
type LitMaterial = THREE.MeshPhysicalMaterial;

// How much of the blue backdrop's colour the glass passes through (REF_129: 10 %).
const tintedTransmission = clearCapTransmission.replace(
  'vec3 attenuatedColor = transmittance * transmittedLight.rgb;',
  `transmittedLight.rgb = mix(vec3(dot(transmittedLight.rgb, vec3(0.2126, 0.7152, 0.0722))), transmittedLight.rgb, transmittedSaturation);
  vec3 attenuatedColor = transmittance * transmittedLight.rgb;`,
);

// The backdrop glowing round the silhouettes of the black props: brightest where their walls are seen edge-on.
const PROP_RIM = `#include <emissivemap_fragment>
  totalEmissiveRadiance += propRim.rgb * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), propRim.a);`;

// Light linking: the key, fill and top lights reach only the products and the dispenser.
const linkedLights = THREE.ShaderChunk.lights_fragment_begin.replace(
  'rectAreaLight = rectAreaLights[ i ];',
  'rectAreaLight = rectAreaLights[ i ];\nrectAreaLight.color *= refLightMask[ i ];',
);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} unavailable`);
  return response.json();
}

/** REF_129 "Ancient Wisdom" shelf (ref129-runtime.mjs): animated camera, area lights with per-frame power. */
export async function createWisdomScene(canvas: HTMLCanvasElement): Promise<WisdomScene> {
  const [manifest, lutInfo, compositor] = await Promise.all([
    fetchJson<Manifest>(WISDOM_ASSETS + 'scene_manifest.json'),
    fetchJson<LutInfo>(HERO_ASSETS + 'filmic_lut.json'),
    fetchJson<Compositor>(WISDOM_ASSETS + 'compositor.json'),
  ]);
  finishTask('wisdom-data');

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, lutBuffer] = await Promise.all([
    loader
      .loadAsync(WISDOM_ASSETS + WISDOM_MODEL, (event) => {
        if (event.total) reportProgress('wisdom-model', event.loaded / event.total);
      })
      .finally(() => finishTask('wisdom-model')),
    fetchWithProgress(HERO_ASSETS + lutInfo.file, 'hero-lut').then((blob) => blob.arrayBuffer()),
  ]);

  installFilmic(lutInfo);
  RectAreaLightUniformsLib.init();

  // Only the composite quad reaches the canvas; the scene is antialiased in the HDR target.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x040e31, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 2 ** WISDOM_LOOK.exposure;

  const lut = createLut(lutBuffer, lutInfo);
  const lutUniform = { value: lut };

  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const animatedCamera = gltf.cameras[0] as THREE.PerspectiveCamera | undefined;
  if (!animatedCamera) throw new Error('Animated camera missing');
  const camera = animatedCamera;

  // ---- lights ----
  const studio = manifest.lights.map((definition) => {
    const node = gltf.scene.getObjectByName(definition.name);
    if (!node) throw new Error(`${definition.name} missing`);
    const light = new THREE.RectAreaLight(
      new THREE.Color().setRGB(...definition.color),
      0,
      definition.width,
      definition.height,
    );
    node.add(light);
    return { light, definition, scale: 1 / (Math.PI * definition.width * definition.height) };
  });
  // In the order three uploads them: scene traversal.
  const uploadOrder: THREE.RectAreaLight[] = [];
  scene.traverse((object) => {
    if ((object as THREE.RectAreaLight).isRectAreaLight) uploadOrder.push(object as THREE.RectAreaLight);
  });
  const reachesProps = uploadOrder.map(
    (light) => studio.find((s) => s.light === light)?.definition.targetGroup === 'all',
  );
  const lightMask: Record<Group, number[]> = {
    products: reachesProps.map(() => 1),
    props: reachesProps.map((all) => (all ? 1 : 0)),
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | null = null;

  // ---- materials: one copy per light group ----
  const groupOf = (object: THREE.Object3D): Group => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (manifest.productNodes.includes(node.name) || node.userData.role === 'dispenser') return 'products';
    }
    return 'props';
  };
  const copies = new Map<string, LitMaterial>();
  const sources = new Set<LitMaterial>();
  const baseRoughness = new Map<LitMaterial, number>();
  const baseEmission = new Map<LitMaterial, number>();
  const transmittedSaturation = { value: 1 };
  const propRim = { value: new THREE.Vector4() };
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  function copyFor(source: LitMaterial, group: Group) {
    const key = source.uuid + group;
    const existing = copies.get(key);
    if (existing) return existing;
    sources.add(source);
    const material = source.clone();
    copies.set(key, material);

    // Nested transmission does not refract: the liquid becomes the dark backing of the outer glass.
    if (material.name.endsWith('Liquid_Dark')) {
      material.transmission = 0;
      material.color.setRGB(0.018, 0.021, 0.028);
      material.roughness = 0.18;
    }
    baseRoughness.set(material, material.roughness);
    if (material.emissiveMap) baseEmission.set(material, material.emissiveIntensity);
    for (const value of Object.values(material)) {
      if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).anisotropy = maxAnisotropy;
    }

    const mask = { value: lightMask[group] };
    const rimmed = group === 'props' && !material.emissiveMap;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.heroLUT = lutUniform;
      shader.uniforms.refLightMask = mask;
      shader.uniforms.transmittedSaturation = transmittedSaturation;
      if (rimmed) {
        shader.uniforms.propRim = propRim;
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform vec4 propRim;\nvoid main() {')
          .replace('#include <emissivemap_fragment>', PROP_RIM);
      }
      shader.fragmentShader =
        '#if NUM_RECT_AREA_LIGHTS > 0\nuniform float refLightMask[NUM_RECT_AREA_LIGHTS];\n#endif\n' +
        shader.fragmentShader.replace('#include <lights_fragment_begin>', linkedLights);
      if (material.transmission > 0) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <transmission_pars_fragment>',
          `uniform float transmittedSaturation;
${tintedTransmission}`,
        );
      }
    };
    material.customProgramCacheKey = () => `kelv-wisdom-${group}${rimmed ? '-rim' : ''}`;
    return material;
  }

  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const group = groupOf(mesh);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => copyFor(m as LitMaterial, group))
      : copyFor(mesh.material as LitMaterial, group);
  });
  for (const source of sources) source.dispose();
  const materials = [...copies.values()];
  const dispenser: { node: THREE.Object3D; base: THREE.Vector3 }[] = [];
  gltf.scene.traverse((object) => {
    if (object.userData.role === 'dispenser') dispenser.push({ node: object, base: object.position.clone() });
  });

  // The glossy black props reflect the glowing wall and shelf (Cycles: blue in secondary rays), not a flat world colour.
  const reflected = new THREE.Scene();
  reflected.background = new THREE.Color().setRGB(...manifest.world.linearColor);
  const mirrored: { material: THREE.MeshBasicMaterial; strength: number }[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const source = mesh.material as LitMaterial | undefined;
    if (!mesh.isMesh || !source?.emissiveMap) return;
    const material = new THREE.MeshBasicMaterial({ map: source.emissiveMap, side: THREE.DoubleSide });
    const copy = new THREE.Mesh(mesh.geometry, material);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    reflected.add(copy);
    mirrored.push({ material, strength: baseEmission.get(source) ?? 1 });
  });
  const productCentre = new THREE.Vector3();
  const productBox = new THREE.Box3();
  for (const name of manifest.productNodes) {
    const node = gltf.scene.getObjectByName(name);
    if (node) productBox.expandByObject(node);
  }
  productBox.getCenter(productCentre);
  const reflectionTint = new THREE.Color();

  function bakeEnvironment() {
    const { strength, tint, blur } = WISDOM_LOOK.reflection;
    reflectionTint.set(tint);
    for (const { material, strength: emission } of mirrored) {
      material.color.copy(reflectionTint).multiplyScalar(emission * strength);
    }
    environment?.dispose();
    environment = pmrem.fromScene(reflected, blur, 0.001, 10, { position: productCentre });
    scene.environment = environment.texture;
  }

  // ---- animation ----
  const clip = gltf.animations.find((a) => a.name === manifest.clip);
  if (!clip) throw new Error(`${manifest.clip} missing`);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  // Amplified around the Figma frame (MOTION_PIVOT): sampled from the clip, so the mixer's own write is replaced.
  const sample = (node: THREE.Object3D, path: 'position' | 'quaternion') => {
    const track = clip.tracks.find((t) => t.name === `${node.name}.${path}`);
    if (!track) throw new Error(`${node.name}.${path} not animated`);
    return track.InterpolantFactoryMethodLinear();
  };
  const yawOf = (q: ArrayLike<number>) => 2 * Math.atan2(q[1], q[3]);
  const cameraPosition = sample(camera, 'position');
  const cameraRotation = sample(camera, 'quaternion');
  const pivot = new THREE.Vector3().fromArray(cameraPosition.evaluate(MOTION_PIVOT));
  const pivotYaw = yawOf(cameraRotation.evaluate(MOTION_PIVOT));
  const spinning = manifest.productNodes.map((name) => {
    const node = gltf.scene.getObjectByName(name);
    if (!node) throw new Error(`${name} missing`);
    const rotation = sample(node, 'quaternion');
    return { node, rotation, pivot: yawOf(rotation.evaluate(MOTION_PIVOT)) };
  });
  const up = new THREE.Vector3(0, 1, 0);

  function amplify(t: number) {
    const { lateral, push, spin } = WISDOM_LOOK.motion;
    const p = cameraPosition.evaluate(t);
    camera.position.set(
      pivot.x + (p[0] - pivot.x) * lateral,
      pivot.y + (p[1] - pivot.y) * lateral,
      pivot.z + (p[2] - pivot.z) * push,
    );
    camera.quaternion.setFromAxisAngle(up, pivotYaw + (yawOf(cameraRotation.evaluate(t)) - pivotYaw) * lateral);
    for (const product of spinning) {
      const yaw = product.pivot + (yawOf(product.rotation.evaluate(t)) - product.pivot) * spin;
      product.node.quaternion.setFromAxisAngle(up, yaw);
    }
  }

  const post = createPostprocessing(renderer, lut, compositor);
  let time = -1;

  function setTime(seconds: number, force = false) {
    const t = THREE.MathUtils.clamp(seconds, 0, manifest.duration);
    if (t === time && !force) return;
    time = t;
    mixer.setTime(t);
    amplify(t);
    const frame = t * manifest.fps;
    const lo = Math.min(manifest.samples - 1, Math.floor(frame));
    const hi = Math.min(manifest.samples - 1, lo + 1);
    for (const { light, definition, scale } of studio) {
      const power = THREE.MathUtils.lerp(definition.power[lo], definition.power[hi], frame - lo);
      light.intensity = power * scale * (WISDOM_LOOK.lights[definition.control] ?? 1);
    }
    scene.updateMatrixWorld(true);
  }

  let aspect = manifest.camera.aspectRatio;

  // Blender's vertical lens shift, which glTF cameras cannot store; portrait screens crop the side props.
  // `frame` then zooms and pans the image (NDC), to match the Figma crop.
  function project() {
    const { zoom, x, y } = WISDOM_LOOK.frame;
    const reference = manifest.camera.aspectRatio;
    const fit = Math.max(
      1,
      THREE.MathUtils.lerp(0.84, reference, THREE.MathUtils.smoothstep(aspect, 0.55, 1.2)) / aspect,
    );
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(manifest.camera.yfov / 2) * fit));
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    const m = camera.projectionMatrix.elements;
    m[8] = ((2 * manifest.camera.shiftX * reference) / (fit * aspect)) * zoom - x;
    m[9] = ((2 * manifest.camera.shiftY * reference) / fit) * zoom - y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function applyLook() {
    const look = WISDOM_LOOK;
    renderer.toneMappingExposure = 2 ** look.exposure;
    scene.environmentIntensity = manifest.world.strength * look.ambient;
    for (const [material, roughness] of baseRoughness) material.roughness = Math.min(1, roughness * look.roughness);
    for (const [material, strength] of baseEmission) {
      material.emissiveIntensity = strength * (material.name.endsWith('Wall') ? look.wall : look.shelf);
    }
    for (const material of materials) {
      if (material.name.endsWith('Cap_Clear')) {
        Object.assign(material, {
          transmission: look.cap.transmission,
          roughness: look.cap.roughness,
          ior: look.cap.ior,
        });
        material.color.set(look.cap.tint);
      } else if (material.name.endsWith('Glass_Smoke')) {
        Object.assign(material, {
          transmission: look.glass.transmission,
          roughness: look.glass.roughness,
          thickness: look.glass.thickness / 1000,
          attenuationDistance: look.glass.absorption / 1000,
        });
        material.color.set(look.glass.tint);
        material.attenuationColor.set(look.glass.absorbed);
      }
    }
    transmittedSaturation.value = look.glass.saturation;
    const { color, strength, power } = look.propRim;
    const rim = new THREE.Color(color).multiplyScalar(strength);
    propRim.value.set(rim.r, rim.g, rim.b, power);
    bakeEnvironment();
    for (const { node, base } of dispenser)
      node.position.set(base.x + look.dispenser.x, base.y, base.z + look.dispenser.z);
    project();
    setTime(time, true);
  }

  applyLook();
  setTime(0);
  await post.compile(scene, camera);
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if ((value as THREE.Texture | null)?.isTexture) renderer.initTexture(value as THREE.Texture);
    }
  }
  renderer.initTexture(lut);
  finishTask('wisdom-compile');

  return {
    duration: manifest.duration,
    applyLook,

    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      post.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      aspect = width / height;
      project();
    },

    setTime(seconds) {
      setTime(seconds);
    },

    render() {
      post.render(scene, camera, WISDOM_LOOK);
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
      environment?.dispose();
      for (const { material } of mirrored) material.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
