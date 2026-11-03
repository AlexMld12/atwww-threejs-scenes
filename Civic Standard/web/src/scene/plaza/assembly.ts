import * as THREE from 'three';
import { fromBlender } from './sun';

// The product putting itself together, on a loop (the colleague's exploded views, tools/blender_exploded.py): the
// plaza empty, then piece after piece in the order it would be built, each fading in as it comes home from where his
// exploded view has it; it stands assembled a while, fades away whole and starts again.

// seconds; next: the share of a step's travel after which the next step sets off; empty: the plaza alone, first
const TIMING = { empty: 0.5, travel: 0.6, next: 0.4, hold: 0.8, fade: 0.4 };
// the share of its travel over which a piece fades in; the share over which it comes across (then only down: a slat
// set between the rails would cut through the front one coming in on the slant)
const APPEAR = 0.6;
const ACROSS = 0.6;

// The building order, step by step, two pieces at a time (a pair comes together): what stands on the ground first,
// then what it carries, the small parts last. Names are the parts of the exploded views.
const SEQUENCE: Record<string, string[][]> = {
  // the two ends stand, the long rails tie them, the bearers go across left to right, then the slats, back to front
  K4_1900: [
    ['frame_0', 'frame_1'],
    ['frame_3', 'frame_2'],
    ['frame_4', 'frame_7'],
    ['frame_5', 'frame_6'],
    ['boards_4', 'boards_2'],
    ['boards_1', 'boards_9'],
    ['boards_8', 'boards_7'],
    ['boards_6', 'boards_5'],
    ['boards_3', 'boards_0'],
  ],
  // the two ends stand, the three rails go between them (lowest first), their end plates, the hoops hang on them left
  // to right, then each rail's joints at both ends: the clamp plates, then their bolts
  K8_module: [
    ['frame_0', 'frame_4'],
    ['tubes_6', 'tubes_7'],
    ['tubes_10'],
    ['tubes_2', 'tubes_9'],
    ['tubes_13', 'tubes_11'],
    ['tubes_4', 'tubes_14'],
    ['tubes_15', 'tubes_8'],
    ['tubes_5', 'tubes_16'],
    ['tubes_3', 'tubes_0'],
    ['tubes_1', 'tubes_12'],
    ['frame_2', 'frame_6'],
    [
      'fasteners_10',
      'fasteners_15',
      'fasteners_2',
      'fasteners_6',
      'fasteners_11',
      'fasteners_18',
      'fasteners_4',
      'fasteners_7',
    ],
    ['frame_3', 'frame_7'],
    [
      'fasteners_12',
      'fasteners_14',
      'fasteners_16',
      'fasteners_3',
      'fasteners_1',
      'fasteners_19',
      'fasteners_20',
      'fasteners_21',
    ],
    ['frame_1', 'frame_5'],
    [
      'fasteners_13',
      'fasteners_5',
      'fasteners_8',
      'fasteners_9',
      'fasteners_0',
      'fasteners_17',
      'fasteners_22',
      'fasteners_23',
    ],
  ],
};
// a product without its order: role after role
const ROLES = ['frame', 'tubes', 'boards', 'fasteners'];

// a short tail: it does not creep the last millimetres home
const cubicOut = (t: number) => 1 - (1 - t) ** 3;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface Piece {
  object: THREE.Object3D;
  /** Its own (plaza-scene.ts gives each piece one): its fade, and the AO baked assembled darkens faces that touch
   *  only at home. */
  materials: THREE.MeshStandardMaterial[];
  /** Flat white as present as the piece is: its share of the shadow on the paving. */
  silhouette: THREE.MeshBasicMaterial;
  home: THREE.Vector3;
  offset: THREE.Vector3;
  /** When it sets off, from the loop's start. */
  start: number;
  alpha: number;
}

export function createAssembly(root: THREE.Object3D, product: string) {
  const found = new Map<string, { object: THREE.Object3D; offset: THREE.Vector3; role: string }>();
  const strays: THREE.Object3D[] = [];
  root.traverse((object) => {
    const { offset, role } = object.userData as { offset?: number[]; role?: string };
    // named <product>_<piece> by tools/blender_configurator.py
    if (offset)
      found.set(object.name.slice(product.length + 1), { object, offset: fromBlender(offset), role: role ?? '' });
    // the studio file's hidden objects ride along in its exports (Blender cannot unselect them): only pieces stay
    else if (object.parent === root) strays.push(object);
  });
  strays.forEach((object) => object.removeFromParent());

  const steps = (SEQUENCE[product] ?? []).map((names) => names.filter((name) => found.has(name)));
  const placed = new Set(steps.flat());
  const rank = (role: string) => (ROLES.includes(role) ? ROLES.indexOf(role) : ROLES.length);
  [...found]
    .filter(([name]) => !placed.has(name))
    .sort(([, a], [, b]) => rank(a.role) - rank(b.role) || a.offset.x - b.offset.x)
    .forEach(([name]) => steps.push([name]));

  const pieces: Piece[] = [];
  let at = TIMING.empty;
  for (const names of steps.filter((names) => names.length)) {
    for (const name of names) {
      const { object, offset } = found.get(name)!;
      const materials: THREE.MeshStandardMaterial[] = [];
      object.traverse((child) => child instanceof THREE.Mesh && materials.push(child.material));
      materials.forEach((material) => (material.transparent = true));
      object.visible = false;
      const silhouette = new THREE.MeshBasicMaterial();
      pieces.push({ object, materials, silhouette, home: object.position.clone(), offset, start: at, alpha: 0 });
    }
    at += TIMING.travel * TIMING.next;
  }
  const assembled = at - TIMING.travel * TIMING.next + TIMING.travel;
  const loop = assembled + TIMING.hold + TIMING.fade;

  return {
    /** The time it stands whole. */
    whole: assembled,
    /** Places the pieces at `time` (seconds); returns how much of the product's shade is on the paving, 0 to 1. */
    update(time: number) {
      const t = time % loop;
      const present = 1 - smooth(clamp01((t - assembled - TIMING.hold) / TIMING.fade));
      let home = 0;
      for (const piece of pieces) {
        const travelled = clamp01((t - piece.start) / TIMING.travel);
        // across first, down all the way: it comes into its place from straight above
        const across = 1 - cubicOut(clamp01(travelled / ACROSS));
        const down = 1 - cubicOut(travelled);
        piece.object.position.set(
          piece.home.x + piece.offset.x * across,
          piece.home.y + piece.offset.y * down,
          piece.home.z + piece.offset.z * across,
        );
        piece.alpha = smooth(clamp01(travelled / APPEAR)) * present;
        piece.object.visible = piece.alpha > 0.002;
        // a shadow map has no half shadows: a piece casts once mostly there
        piece.object.traverse((child) => (child.castShadow = piece.alpha > 0.5));
        piece.silhouette.color.setScalar(piece.alpha);
        home += travelled;
      }
      const together = pieces.length ? home / pieces.length : 1;
      // a piece's AO is the others' shade too (the rails' tops under the slats): it waits for them all
      for (const piece of pieces) {
        const occlusion = Math.min(clamp01((t - piece.start) / TIMING.travel), together) ** 8;
        for (const material of piece.materials) {
          material.aoMapIntensity = occlusion;
          material.opacity = piece.alpha;
        }
      }
      return together ** 4 * present;
    },
    /** True while anything moves or fades (the shadows are drawn again then). */
    moving(time: number) {
      const t = time % loop;
      return t < assembled + 0.05 || t > assembled + TIMING.hold - 0.05;
    },
    /** `draw` with each piece flat white, as present as it is: the silhouette the paving's shadow is made from. */
    silhouette(draw: () => void) {
      const kept = pieces.map((piece) => {
        const meshes: [THREE.Mesh, THREE.Material][] = [];
        piece.object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          meshes.push([child, child.material]);
          child.material = piece.silhouette;
        });
        return meshes;
      });
      draw();
      kept.flat().forEach(([mesh, material]) => (mesh.material = material));
    },
    dispose() {
      pieces.forEach((piece) => piece.silhouette.dispose());
    },
  };
}
