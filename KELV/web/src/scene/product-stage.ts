import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { finishTask, reportProgress, type PreloadTask } from '@/lib/preload';
import {
  PACKSHOT_CAMERA,
  PACKSHOT_LIGHTS,
  PRODUCT_ASSETS,
  PRODUCT_LOOK,
  PRODUCTS,
  type ProductName,
} from './product-config';
import { clearCapTransmission } from './transmission';

type LitMaterial = THREE.MeshPhysicalMaterial;

export interface ProductPose {
  /** Turn about the bottle's axis, radians. */
  spin: number;
  tiltX: number;
  tiltY: number;
  /** In-plane rotation of the whole render about the frame's centre, radians clockwise (like CSS rotate). */
  roll?: number;
}

export interface ProductStage {
  setProduct(name: ProductName): void;
  setPose(pose: ProductPose): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Re-applies PRODUCT_LOOK after it was changed at runtime (the dev tuning hook). */
  applyLook(): void;
  render(): void;
  dispose(): void;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models = new Map<ProductName, Promise<THREE.Object3D>>();
const diffuse: THREE.IUniform<number> = { value: PRODUCT_LOOK.diffuse };
const textureBias: THREE.IUniform<number> = { value: PRODUCT_LOOK.textureBias };

// A sharper mip level for the labels: at these sizes the default one softens the small print.
const SHARP_MAP = THREE.ShaderChunk.map_fragment.replace(
  'texture2D( map, vMapUv )',
  'texture2D( map, vMapUv, productTextureBias )',
);

// The packshot's world lights surfaces at 0.15 of its reflections (Blender's Light Path split).
const DIFFUSE_IBL = THREE.ShaderChunk.lights_fragment_maps.replace(
  'iblIrradiance += getIBLIrradiance( geometryNormal );',
  'iblIrradiance += productDiffuse * getIBLIrradiance( geometryNormal );',
);

function prepare(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat() as LitMaterial[]) {
      if (material.userData.prepared) continue;
      const isCap = (material.transmission ?? 0) > 0;
      material.userData = { prepared: true, isCap, roughness: material.roughness };
      material.onBeforeCompile = (shader) => {
        shader.uniforms.productDiffuse = diffuse;
        shader.uniforms.productTextureBias = textureBias;
        shader.fragmentShader =
          `uniform float productDiffuse;\nuniform float productTextureBias;\n${shader.fragmentShader}`
            .replace('#include <lights_fragment_maps>', DIFFUSE_IBL)
            .replace('#include <map_fragment>', SHARP_MAP)
            .replace(
              '#include <transmission_pars_fragment>',
              isCap ? clearCapTransmission : '#include <transmission_pars_fragment>',
            );
      };
      material.customProgramCacheKey = () => (isCap ? 'kelv-product-cap' : 'kelv-product');
    }
  });
  return root;
}

/** Loads a product once for the whole page; the preloader follows the download. */
export function loadProduct(name: ProductName) {
  let model = models.get(name);
  if (!model) {
    const { task } = PRODUCTS[name];
    model = loader
      .loadAsync(`${PRODUCT_ASSETS}${name}.glb`, (event) => {
        if (event.total) reportProgress(task, event.loaded / event.total);
      })
      .then((gltf) => prepare(gltf.scene))
      .finally(() => finishTask(task));
    models.set(name, model);
  }
  return model;
}

export async function createProductStage(
  canvas: HTMLCanvasElement,
  names: ProductName[],
  compileTask: PreloadTask,
): Promise<ProductStage> {
  const templates = await Promise.all(names.map(loadProduct));
  RectAreaLightUniformsLib.init();

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping;

  const scene = new THREE.Scene();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(1, 1, 1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0, 0.001, 10);
  scene.environment = environment.texture;

  // roll (about the frame's centre) > rig (product at the origin, lights) > tilt > spin > model
  const roll = new THREE.Group();
  const rig = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  tilt.add(spin);
  rig.add(tilt);
  roll.add(rig);
  scene.add(roll);

  const products = new Map(names.map((name, i) => [name, templates[i].clone(true)]));
  for (const model of products.values()) {
    model.visible = false;
    spin.add(model);
  }

  const lights = Object.entries(PACKSHOT_LIGHTS).map(([control, light]) => {
    const area = new THREE.RectAreaLight(0xffffff, 0, light.size, light.size);
    rig.add(area);
    return { area, light, control: control as keyof typeof PACKSHOT_LIGHTS };
  });

  const camera = new THREE.PerspectiveCamera(PACKSHOT_CAMERA.fov, 1, 0.01, 10);
  let current: ProductName = names[0];

  const materials = new Set<LitMaterial>();
  for (const model of products.values()) {
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) for (const m of [mesh.material].flat()) materials.add(m as LitMaterial);
    });
  }

  function place() {
    const { centre } = PRODUCTS[current];
    const { height, distance, fov, shiftY } = PACKSHOT_CAMERA;
    const eye = height - centre;
    camera.position.set(0, eye, distance);
    camera.lookAt(0, eye, 0);
    // The frame's centre on the product plane: below the camera axis by the lens shift.
    const pivot = eye + shiftY * 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const angle = roll.rotation.z;
    roll.rotation.z = 0;
    roll.position.set(0, pivot, 0);
    rig.position.set(0, -pivot, 0);
    scene.updateMatrixWorld(true);
    for (const { area, light } of lights) {
      const [x, y, z] = light.position;
      area.position.set(x, z - centre, -y);
      area.lookAt(0, 0, 0);
    }
    roll.rotation.z = angle;
  }

  function setProduct(name: ProductName) {
    current = name;
    for (const [key, model] of products) model.visible = key === name;
    place();
  }

  function applyLook() {
    const look = PRODUCT_LOOK;
    renderer.toneMappingExposure = 2 ** look.exposure;
    scene.environmentIntensity = look.environment;
    diffuse.value = look.diffuse;
    textureBias.value = look.textureBias;
    for (const { area, light, control } of lights) {
      area.intensity = (light.watts / (Math.PI * light.size * light.size)) * look[control];
    }
    for (const material of materials) {
      if (material.userData.isCap) {
        material.roughness = look.cap.roughness;
        material.transmission = look.cap.transmission;
        material.color.setScalar(look.cap.tint);
        material.emissive.setScalar(look.cap.haze);
      } else {
        material.roughness = Math.min(1, material.userData.roughness * look.roughness);
      }
    }
    place();
  }

  applyLook();

  // Compile every product as it will be drawn, and upload the textures, while the preloader runs.
  for (const model of products.values()) model.visible = true;
  await renderer.compileAsync(scene, camera);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (!(value as THREE.Texture | null)?.isTexture) continue;
      (value as THREE.Texture).anisotropy = anisotropy;
      renderer.initTexture(value as THREE.Texture);
    }
  }
  setProduct(current);
  finishTask(compileTask);

  return {
    setProduct,

    setPose(pose) {
      tilt.rotation.x = pose.tiltX;
      spin.rotation.y = pose.tiltY + pose.spin;
      roll.rotation.z = -(pose.roll ?? 0);
    },

    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Blender's lens shift: the view slides by a share of the frame, without tilting the camera.
      camera.setViewOffset(width, height, 0, -PACKSHOT_CAMERA.shiftY * height, width, height);
    },

    applyLook,

    render() {
      renderer.render(scene, camera);
    },

    dispose() {
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
