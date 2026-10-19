import { INTRO, TUBE } from './config';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const ROWS_HIDDEN = new Array<number>(TUBE.rows).fill(0);
const span = ([start, end]: readonly number[], t: number) => clamp01((t - start) / (end - start));

/** Where the handover animation stands `t` seconds after the scene took the lines over (-1 = not yet). */
export function introState(t: number) {
  if (t < 0) return { glass: 0, lines: 0, tilt: 0, spin: 0, backdrop: 0, rows: ROWS_HIDDEN };
  return {
    glass: easeInOut(span(INTRO.glass, t)),
    lines: 1 - easeInOut(span(INTRO.lines, t)),
    tilt: easeInOut(span(INTRO.tilt, t)),
    spin: easeInOut(span(INTRO.spin, t)),
    backdrop: easeInOut(span(INTRO.backdrop, t)),
    rows: Array.from({ length: TUBE.rows }, (_, i) =>
      easeOut(clamp01((t - INTRO.riseStart - i * INTRO.riseStagger) / INTRO.riseDuration)),
    ),
  };
}
