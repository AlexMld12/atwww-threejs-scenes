import * as THREE from 'three';
import { TUBE } from './config';

const LOOP = TUBE.familySpeeds.length * TUBE.rowSpacing;

/** Crops a texture to fill a rectangle of `aspect` (width / height) like CSS `cover`; `alignY` as object-position y. */
export function coverCrop(texture: THREE.Texture, imageAspect: number, aspect: number, alignY = 0.5) {
  const width = Math.min(1, aspect / imageAspect);
  const height = Math.min(1, imageAspect / aspect);
  texture.repeat.set(width, height);
  // uv y runs bottom-up.
  texture.offset.set((1 - width) / 2, (1 - height) * (1 - alignY));
}

/** A picture of the tube: its texture (shared by its repeats) and the image's width / height. */
export interface Picture {
  map: THREE.Texture;
  aspect: number;
}

export interface Panel {
  mesh: THREE.Mesh;
  row: number;
  family: number;
  /** The column's angle in its row, before the row turns. */
  phi: number;
}

/**
 * The 9 rows of 6 panels, and the pictures they show: `pictures` holds a cell's picture for each of the
 * contentRows × columns cells, row by row. The rows stay where they are and wrap round every three (wrapRows); as
 * they do, `show` moves the pictures on by three rows, so the tube runs through all of them and starts again.
 * Pictures are shown as they are (photographs, past the view curve), never mirrored on the far side.
 */
export function createTube(pictures: Picture[], anisotropy: number) {
  const tube = new THREE.Group();
  const rows: THREE.Group[] = [];
  const panels: Panel[][] = [];
  const geometry = new THREE.PlaneGeometry(TUBE.panelWidth, TUBE.panelHeight);
  const materials = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  const cellMaterial = pictures.map(({ map, aspect }) => {
    if (!materials.has(map)) {
      const cropped = map.clone();
      cropped.anisotropy = anisotropy;
      coverCrop(cropped, aspect, TUBE.panelWidth / TUBE.panelHeight);
      const material = new THREE.MeshBasicMaterial({ map: cropped, side: THREE.DoubleSide, toneMapped: false });
      // Panels on the camera's side of the tube show their back: flip it so the picture reads the right way round.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          THREE.ShaderChunk.map_fragment.replace(
            'texture2D( map, vMapUv )',
            'texture2D( map, gl_FrontFacing ? vMapUv : vec2( 1.0 - vMapUv.x, vMapUv.y ) )',
          ),
        );
      };
      material.customProgramCacheKey = () => 'tube-picture';
      materials.set(map, material);
    }
    return materials.get(map)!;
  });

  for (let r = 0; r < TUBE.rows; r++) {
    const family = r % TUBE.familySpeeds.length;
    const row = new THREE.Group();
    panels.push([]);
    for (let c = 0; c < TUBE.columns; c++) {
      const phi = (-(c + TUBE.familyOffsets[family]) / TUBE.columns) * Math.PI * 2;
      const mesh = new THREE.Mesh(geometry, cellMaterial[0]);
      mesh.position.set(Math.cos(phi) * TUBE.radius, 0, -Math.sin(phi) * TUBE.radius);
      mesh.rotation.y = phi - Math.PI / 2;
      panels[r].push({ mesh, row: r, family, phi });
      row.add(mesh);
    }
    rows.push(row);
    tube.add(row);
  }

  let shown = NaN;
  /** The pictures for `round` wraps of the rows: physical row i shows content row i + 3 × round. */
  function show(round: number) {
    if (round === shown) return;
    shown = round;
    panels.forEach((row, i) => {
      const content = mod(i + TUBE.familySpeeds.length * round, TUBE.contentRows);
      row.forEach((panel, c) => {
        const cell = content * TUBE.columns + c;
        panel.mesh.material = cellMaterial[cell];
        panel.mesh.userData.cell = cell;
      });
    });
  }
  show(0);

  return {
    tube,
    rows,
    panels,
    /** Shows the pictures for a row travel (the rows' own offset is wrapRows of it). */
    showFor(travel: number) {
      show(Math.floor((travel + LOOP / 2) / LOOP));
    },
    /** The panel showing a cell now (every cell is on one of the rows). */
    panelOf(cell: number) {
      return panels.flat().find((panel) => panel.mesh.userData.cell === cell)!;
    },
    dispose() {
      geometry.dispose();
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    },
  };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Row offset inside one repeat of the three families, centred on 0 (Blender's row driver). */
export function wrapRows(travel: number) {
  return mod(travel + LOOP / 2, LOOP) - LOOP / 2;
}
