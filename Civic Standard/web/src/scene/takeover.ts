import * as THREE from 'three';
import { CAMERA, FRAMING, HERO, SCROLL, TAKEOVER, TUBE } from './config';
import { pxPerUnit } from './framing';
import { coverCrop, type Panel } from './tube';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Quadratic through a (u = 0), b (u = ½) and c (u = 1): passes Figma's middle frame without a kink. */
const through = (a: number, b: number, c: number, u: number) => {
  const m = (4 * b - a - c) / 2;
  return a * (1 - u) ** 2 + 2 * m * u * (1 - u) + c * u * u;
};

const FRONT = new THREE.Vector3(0, 0, TUBE.radius);
const FACING = new THREE.Quaternion();
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const normal = new THREE.Vector3();
const from = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
const FRONT_ANGLE = -Math.PI / 2;
const FAMILIES = TUBE.familySpeeds.length;
const LOOP = FAMILIES * TUBE.rowSpacing;
const MIDDLE_ROW = (TUBE.rows - 1) / 2;
const [BENCH_ROW, BENCH_COLUMN] = TUBE.bench;

/**
 * The end of the hero. Nothing pulls the tube: the section is just long enough for a bench row to come level with
 * the centre on its own (`layout`). Before there the scroll turns the bench panel to the front (`turn`), and from
 * there the photo grows to the full screen (`grow`, Figma frames 3 → 5).
 */
export function createTakeover(bench: THREE.Texture, panels: Panel[][]) {
  const map = bench.clone();
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    // Always on top: neighbouring panels sit at its depth as it starts to grow, and the glass (drawn with the
    // transparent objects) is behind it; so it goes last among those.
    new THREE.MeshBasicMaterial({ map, toneMapped: false, depthTest: false, transparent: true }),
  );
  card.renderOrder = 1;
  card.position.copy(FRONT);
  card.visible = false;
  const maskMaterial = new THREE.MeshBasicMaterial({
    color: TAKEOVER.mask,
    toneMapped: false,
    depthTest: false,
    transparent: true,
    opacity: 0,
  });
  const mask = new THREE.Mesh(card.geometry, maskMaterial);
  mask.renderOrder = 2;
  card.add(mask);

  let landingScroll = Infinity;
  // where the tube starts braking towards the landing (seekScreens before it)
  let seekStart = Infinity;
  let landed: Panel = panels[MIDDLE_ROW][BENCH_COLUMN];
  let locked = false;
  // the tube's own angle while the seek eases in, and the front angle it eases to
  let free = 0;
  let seekTo: number | null = null;
  let shownGrowth = 0;

  return {
    card,

    /** The scroll at which the bench's row is level with the centre, once every picture has shown; returns the hero's height. */
    layout(stageHeight: number) {
      // the bench's row comes round every contentRows; the first time past minTravel it is level at this travel
      const passes = Math.ceil((HERO.minTravel / TUBE.rowSpacing + MIDDLE_ROW - BENCH_ROW) / TUBE.contentRows);
      const row = BENCH_ROW + TUBE.contentRows * passes;
      const best = (row - MIDDLE_ROW) * TUBE.rowSpacing;
      // the rows have wrapped round this often by then (tube.ts): the panel that shows it
      landed = panels[row - FAMILIES * Math.floor((best + LOOP / 2) / LOOP)][BENCH_COLUMN];
      // Braking at a constant rate over the seek covers half the distance full speed would: the landing is that
      // much further down the page, so the rows still come to rest with a bench row level with the centre.
      const zone = HERO.seekScreens * stageHeight;
      landingScroll = best / SCROLL.travelPerPx + zone / 2;
      seekStart = landingScroll - zone;
      return landingScroll + (HERO.growScreens + 1) * stageHeight;
    },

    /**
     * Row travel for a scroll: the usual rate, then over the seek it brakes evenly to a standstill at the landing
     * (its speed falls to 0 with no step), where the bench row is level with the centre.
     */
    travelFor(scroll: number) {
      if (scroll <= seekStart) return scroll * SCROLL.travelPerPx;
      const zone = landingScroll - seekStart;
      const p = clamp01((scroll - seekStart) / zone);
      return (seekStart + zone * (p - (p * p) / 2)) * SCROLL.travelPerPx;
    },

    /**
     * Turns the tube on from `angle`. Away from the landing it is the usual motion. Over the last seekScreens the
     * scroll itself brings the bench panel to the front: the tube's own motion fades out as the angle eases (in and
     * out, with the rows' braking) to the nearest front angle, reached exactly at the landing. So the page never
     * waits for it, and the turn is never more than half a turn of the bench's row.
     */
    turn(angle: number, motion: number, scroll: number, dt: number) {
      const p = clamp01((scroll - seekStart) / (landingScroll - seekStart));
      if (p <= 0) {
        seekTo = null;
        locked = false;
        free = angle + motion * dt;
        return free;
      }
      if (seekTo === null) {
        free = angle;
        seekTo = angleFront(angle, 0);
      }
      const e = smooth(p);
      free += motion * dt * (1 - e);
      locked = p >= 1;
      return free + (seekTo - free) * e;
    },

    /** After the landing, once the panel is in front: the photo grows from it to the full screen. */
    grow(scroll: number, width: number, height: number) {
      // From the scroll the tube shows: locked at the landing exactly, so the photo grows on from the same motion.
      shownGrowth = locked ? clamp01((scroll - landingScroll) / (HERO.growScreens * height)) : 0;
      if (shownGrowth < 1e-3) {
        landed.mesh.visible = true;
        card.visible = false;
        return;
      }
      landed.mesh.visible = false;
      card.visible = true;

      const u = smooth(shownGrowth);
      maskMaterial.opacity =
        TAKEOVER.maskOpacity * smooth(clamp01((shownGrowth - TAKEOVER.maskFrom) / (1 - TAKEOVER.maskFrom)));
      // From the panel's place in the ring (where it is as the tube moves off) to the front.
      landed.mesh.updateWorldMatrix(true, false);
      landed.mesh.matrixWorld.decompose(from.position, from.quaternion, from.scale);
      // The ring shows panels on its near side from the back; the card is one-sided, so turn it to its front.
      if (normal.set(0, 0, 1).applyQuaternion(from.quaternion).z < 0) from.quaternion.multiply(HALF_TURN);
      card.position.lerpVectors(from.position, FRONT, Math.min(1, u * 8));
      card.quaternion.slerpQuaternions(from.quaternion, FACING, Math.min(1, u * 8));
      const scale = Math.max(1, width / FRAMING.designWidth);
      // Screen px ↔ scene units at the front of the tube; 2 px of bleed so the full-screen photo has no edge.
      const toScene = (CAMERA.distance - TUBE.radius) / (pxPerUnit(width) * CAMERA.distance);
      // Figma's middle frame (1035 × 612) is wider than a phone: under 1024 px the middle is half way, each side
      const start = [TUBE.panelWidth / toScene, TUBE.panelHeight / toScene];
      const end = [width + 2, height + 2];
      const middle =
        width < 1024
          ? [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
          : [TAKEOVER.grown[0] * scale, TAKEOVER.grown[1] * scale];
      card.scale.set(
        through(start[0], middle[0], end[0], u) * toScene,
        through(start[1], middle[1], end[1], u) * toScene,
        1,
      );
      coverCrop(map, TAKEOVER.imageAspect, card.scale.x / card.scale.y, TAKEOVER.alignY);
    },
  };

  /** The next angle (in `direction`; nearest when 0) at which the landed panel faces the camera. */
  function angleFront(angle: number, direction: number) {
    const speed = TUBE.familySpeeds[landed.family];
    const base = (FRONT_ANGLE - landed.phi) / speed;
    const period = (Math.PI * 2) / speed;
    const turns = (angle - base) / period;
    const k = direction > 0 ? Math.ceil(turns) : direction < 0 ? Math.floor(turns) : Math.round(turns);
    return base + k * period;
  }
}
