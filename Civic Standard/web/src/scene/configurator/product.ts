import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { dress, loadFinishes, type Detail } from './finishes';

// A product from the colleague's studio (tools/blender_configurator.py): its model in the studio's materials, its
// ground shadow, what it reflects, and the studio's four area lights; shared by the configurator and the product
// page's showcase.
export const ASSETS = '/configurator/';

export interface Meta {
  id: string;
  camera: { matrix: number[][]; orthoScale: number };
  lights: { name: string; matrix: number[][]; size: [number, number]; power: number; color: number[] }[];
  bounds: [number[], number[]];
  shadow: { centre: [number, number]; size: number };
}

// Blender is z-up; glTF / three y-up: (x, y, z) → (x, z, −y).
const Z_UP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
export const fromBlender = (rows: number[][]) =>
  new THREE.Matrix4().set(...(rows.flat() as Parameters<THREE.Matrix4['set']>)).premultiply(Z_UP);
export const pointFromBlender = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

export interface Loaded {
  meta: Meta;
  environment: THREE.Texture;
  group: THREE.Group;
  painted: THREE.MeshStandardMaterial[];
  box: THREE.Box3;
}

/** Loads products into `scene` (hidden until shown), compiled for `camera`; `stage` puts a product's lights. */
export function createProductLoader(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  // What the metal reflects: the product's studio without it (tools/blender_configurator_env.py), the grey floor lit
  // by the lights below, the dim world above; prefiltered once per product as it loads.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdrLoader = new HDRLoader();

  // the studio's four area lights (KEY, FILL, RIM, STRIP), placed per product; always four, so no shader recompiles
  const lights = Array.from({ length: 4 }, () => new THREE.RectAreaLight(0xffffff, 0, 1, 1));
  scene.add(...lights);

  // shared assets: the view LUT and the two finishes' detail
  const textureLoader = new THREE.TextureLoader();
  const shared = loadFinishes(ASSETS, textureLoader);
  const metas: Promise<Record<string, Meta>> = fetch(ASSETS + 'products.json').then((r) => r.json());
  // eslint-disable-next-line react-hooks/rules-of-hooks -- not a hook: the decoder's worker pool
  MeshoptDecoder.useWorkers(2); // decoding off the main thread
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  const cache = new Map<string, Promise<Loaded>>();

  function build(
    gltf: GLTF,
    meta: Meta,
    ao: THREE.Texture,
    shadow: THREE.Texture,
    environment: THREE.Texture,
    details: Detail[],
  ): Loaded {
    const group = new THREE.Group();
    const painted = dress(gltf.scene, ao, details);
    group.add(gltf.scene);

    const { centre, size } = meta.shadow;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadow, transparent: true, depthWrite: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centre[0], 0.0005, -centre[1]);
    ground.renderOrder = -1;
    group.add(ground);

    const box = new THREE.Box3(pointFromBlender(meta.bounds[0]), pointFromBlender(meta.bounds[1]));
    box.set(box.min.clone().min(box.max), box.max.clone().max(box.min));
    return { meta, environment, group, painted, box };
  }

  function load(id: string, onProgress?: (fraction: number) => void) {
    if (!cache.has(id)) {
      const shares = [0, 0, 0];
      const report = (i: number) => (event: ProgressEvent) => {
        if (event.total) shares[i] = event.loaded / event.total;
        onProgress?.((shares[0] * 6 + shares[1] + shares[2]) / 8);
      };
      cache.set(
        id,
        Promise.all([
          gltfLoader.loadAsync(`${ASSETS}${id}.glb`, report(0)),
          metas,
          textureLoader.loadAsync(`${ASSETS}${id}-ao.webp`, report(1)),
          textureLoader.loadAsync(`${ASSETS}${id}-shadow.webp`, report(2)),
          hdrLoader.loadAsync(`${ASSETS}${id}-env.hdr`),
          shared,
        ]).then(async ([gltf, all, ao, shadow, studio, details]) => {
          studio.mapping = THREE.EquirectangularReflectionMapping;
          const environment = pmrem.fromEquirectangular(studio).texture;
          studio.dispose();
          ao.flipY = false; // glTF uvs
          ao.colorSpace = THREE.NoColorSpace;
          const loaded = build(gltf, all[id], ao, shadow, environment, details);
          // compiled and uploaded now (outside the scene, with its lights), so showing it later costs no frame
          // every texture of its materials too (the finishes' maps), one a frame: an upload can take tens of ms
          const textures = new Set<THREE.Texture>([ao, shadow]);
          loaded.group.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            for (const material of [child.material].flat() as THREE.Material[])
              for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          });
          for (const texture of textures) {
            renderer.initTexture(texture);
            await new Promise(requestAnimationFrame);
          }
          const current = scene.environment;
          scene.environment = environment;
          await renderer.compileAsync(loaded.group, camera, scene);
          scene.environment = current;
          loaded.group.visible = false;
          scene.add(loaded.group);
          onProgress?.(1);
          return loaded;
        }),
      );
    }
    return cache.get(id)!;
  }

  // ── lights and camera from the product's own studio ──────────────────────────────────────────────────────────
  function stage(meta: Meta) {
    meta.lights.forEach((light, i) => {
      const rect = lights[i];
      const [width, height] = light.size;
      rect.width = width;
      rect.height = height;
      rect.color.setRGB(light.color[0], light.color[1], light.color[2]);
      // Blender's area light: power P over area A, Lambertian → radiance P / (π A)
      rect.intensity = light.power / (Math.PI * width * height);
      fromBlender(light.matrix).decompose(rect.position, rect.quaternion, rect.scale);
      rect.scale.set(1, 1, 1);
    });
  }

  return {
    load,
    stage,
    dispose() {
      cache.forEach((loaded) => loaded.then(({ environment }) => environment.dispose()).catch(() => undefined));
      pmrem.dispose();
    },
  };
}
