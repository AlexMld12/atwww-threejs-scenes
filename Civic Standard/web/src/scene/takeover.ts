import * as THREE from 'three';
import { CAMERA, FRAMING, HERO, SCROLL, TAKEOVER, TUBE } from './config';
import { pxPerUnit } from './framing';
import { coverCrop, type BenchPanel } from './tube';

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
const LOOP = TUBE.familySpeeds.length * TUBE.rowSpacing;
const MIDDLE_ROW = (TUBE.rows - 1) / 2;

/**
 * The end of the hero. Nothing pulls the tube: the section is just long enough for a bench row to come level with
 * the centre on its own (`layout`). Near there the tube keeps turning in its direction until the bench panel is in
 * front, eases to a stop (`turn`), and only then the photo grows to the full screen (`grow`, Figma frames 3 → 5).
 */
export function createTakeover(bench: THREE.Texture, benchPanels: BenchPanel[]) {
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

  // Row offsets (mod one loop) that bring a bench row to height 0, and which panel that is.
  const landings = benchPanels
    .filter((panel) => Math.abs(panel.row - MIDDLE_ROW) <= 1)
    .map((panel) => ({ panel, offset: ((((panel.row - MIDDLE_ROW) * TUBE.rowSpacing) % LOOP) + LOOP) % LOOP }));

  let landingScroll = Infinity;
  let landed: BenchPanel = landings[0].panel;
  let locked = false;
  let shownGrowth = 0;

  return {
    card,

    /** The scroll at which a bench row is level with the centre, after the tube's screens; returns the hero's height. */
    layout(stageHeight: number) {
      const travelAtEnd = HERO.tubeScreens * stageHeight * SCROLL.travelPerPx;
      let best = Infinity;
      for (const { panel, offset } of landings) {
        const travel = offset + LOOP * Math.ceil((travelAtEnd - offset) / LOOP);
        if (travel < best) {
          best = travel;
          landed = panel;
        }
      }
      landingScroll = best / SCROLL.travelPerPx;
      return landingScroll + (HERO.growScreens + 1) * stageHeight;
    },

    /** How far the page may scroll: not past the landing until the bench faces the camera and the photo can grow. */
    gate() {
      return locked ? Infinity : landingScroll;
    },

    /** Row travel the tube may reach: it stops where the bench row is level with the centre. */
    travelFor(scroll: number) {
      return Math.min(scroll, landingScroll) * SCROLL.travelPerPx;
    },

    /**
     * Turns the tube on from `angle`. Away from the landing it is the usual motion; near it the tube keeps turning
     * the same way until the bench panel faces the camera, slows into it and stays there.
     */
    turn(angle: number, motion: number, direction: number, scroll: number, stageHeight: number, dt: number) {
      if (scroll < landingScroll - HERO.seekScreens * stageHeight) {
        locked = false;
        return angle + motion * dt;
      }
      if (locked) return angleFront(angle, 0);
      const target = angleFront(angle, direction);
      const remaining = (target - angle) * direction;
      // The page waits at the landing for the bench (`gate`): there the tube turns faster, and never slower than
      // seekMinSpeed, or the last fraction of a turn would take seconds.
      const held = scroll >= landingScroll - 1;
      const speed = Math.max(
        HERO.seekMinSpeed,
        Math.min(
          held ? HERO.seekHeldSpeed : HERO.seekSpeed,
          remaining * HERO.seekEase * (held ? 2 : 1) + Math.abs(motion) * 0.25,
        ),
      );
      const next = angle + direction * speed * dt;
      if ((target - next) * direction <= 1e-4) {
        locked = true;
        return target;
      }
      return next;
    },

    /** After the landing, once the panel is in front: the photo grows from it to the full screen. */
    grow(scroll: number, width: number, height: number) {
      // Straight from the (smoothed) scroll: the page cannot pass the landing before the lock (`gate`), so the photo
      // is full exactly when BUILT OUTSIDE takes over.
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
      card.scale.set(
        through(TUBE.panelWidth / toScene, TAKEOVER.grown[0] * scale, width + 2, u) * toScene,
        through(TUBE.panelHeight / toScene, TAKEOVER.grown[1] * scale, height + 2, u) * toScene,
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
