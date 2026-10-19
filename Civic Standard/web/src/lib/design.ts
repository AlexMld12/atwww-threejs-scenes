/** Figma px of the 1440 frame → CSS px: the clamp rule of styles/tokens.css, for layouts computed in JS. */
export function designPx(n: number) {
  return n * Math.max(1, window.innerWidth / 1720);
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
