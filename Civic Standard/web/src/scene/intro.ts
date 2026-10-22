import { INTRO } from './config';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const span = ([start, end]: readonly number[], t: number) => clamp01((t - start) / (end - start));

/** Where the handover animation stands `t` seconds after the preloader handed over (-1 = not yet). */
export function introState(t: number) {
  if (t < 0) return { tilt: 0, spin: 0, backdrop: 0, rise: () => 0 };
  return {
    tilt: easeInOut(span(INTRO.tilt, t)),
    spin: easeInOut(span(INTRO.spin, t)),
    backdrop: easeInOut(span(INTRO.backdrop, t)),
    // How far a row has come up, by its place in the tube (0 = the bottom row's), not by which row it is: a fast
    // scroll wraps the rows round (every third is alike), and the row arriving at a place then rises as the last did.
    rise: (place: number) => easeOut(clamp01((t - INTRO.riseStart - place * INTRO.riseStagger) / INTRO.riseDuration)),
  };
}
