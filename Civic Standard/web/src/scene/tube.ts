import * as THREE from 'three';
import { TAKEOVER, TUBE } from './config';
import { bindViewCurve } from './view-curve';

/** Crops a texture to fill a rectangle of `aspect` (width / height) like CSS `cover`; `alignY` as object-position y. */
export function coverCrop(texture: THREE.Texture, imageAspect: number, aspect: number, alignY = 0.5) {
  const width = Math.min(1, aspect / imageAspect);
  const height = Math.min(1, imageAspect / aspect);
  texture.repeat.set(width, height);
  // uv y runs bottom-up.
  texture.offset.set((1 - width) / 2, (1 - height) * (1 - alignY));
}

export interface BenchPanel {
  mesh: THREE.Mesh;
  row: number;
  family: number;
  /** The column's angle in its row, before the row turns. */
  phi: number;
}

/**
 * The 9 rows of 6 panels. The paintings go through the view curve like the rest of the render; the bench photo
 * is shown as it is (it continues into the page's photography), never mirrored, and its panels are returned for
 * the takeover.
 */
export function createTube(paintings: THREE.Texture[], bench: THREE.Texture, anisotropy: number) {
  const tube = new THREE.Group();
  const rows: THREE.Group[] = [];
  const panel = new THREE.PlaneGeometry(TUBE.panelWidth, TUBE.panelHeight);
  const materials = paintings.map((map) => {
    map.anisotropy = anisotropy;
    const material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
    bindViewCurve(material);
    return material;
  });
  const benchMap = bench.clone();
  benchMap.anisotropy = anisotropy;
  coverCrop(benchMap, TAKEOVER.imageAspect, TUBE.panelWidth / TUBE.panelHeight);
  const benchMaterial = new THREE.MeshBasicMaterial({ map: benchMap, side: THREE.DoubleSide, toneMapped: false });
  // Panels on the camera's side of the tube show their back: flip it so the photo reads the right way round.
  benchMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace(
        'texture2D( map, vMapUv )',
        'texture2D( map, gl_FrontFacing ? vMapUv : vec2( 1.0 - vMapUv.x, vMapUv.y ) )',
      ),
    );
  };
  materials.push(benchMaterial);
  const benchPanels: BenchPanel[] = [];

  for (let r = 0; r < TUBE.rows; r++) {
    const family = r % TUBE.familySpeeds.length;
    const row = new THREE.Group();
    for (let c = 0; c < TUBE.columns; c++) {
      const phi = (-(c + TUBE.familyOffsets[family]) / TUBE.columns) * Math.PI * 2;
      const material = materials[(family * TUBE.columns + c) % materials.length];
      const mesh = new THREE.Mesh(panel, material);
      mesh.position.set(Math.cos(phi) * TUBE.radius, 0, -Math.sin(phi) * TUBE.radius);
      mesh.rotation.y = phi - Math.PI / 2;
      if (material === benchMaterial) benchPanels.push({ mesh, row: r, family, phi });
      row.add(mesh);
    }
    rows.push(row);
    tube.add(row);
  }
  return { tube, rows, benchPanels };
}

/** Row offset inside one repeat of the three families, centred on 0 (Blender's row driver). */
export function wrapRows(travel: number) {
  const loop = TUBE.familySpeeds.length * TUBE.rowSpacing;
  return ((((travel + loop / 2) % loop) + loop) % loop) - loop / 2;
}
