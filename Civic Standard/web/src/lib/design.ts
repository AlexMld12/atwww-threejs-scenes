/** Figma px of the 1440 frame → CSS px: the clamp rule of styles/tokens.css, for layouts computed in JS. */
export function designPx(n: number) {
  return n * Math.max(1, window.innerWidth / 1720);
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The clamp rule as a CSS length, for layouts given as data (Figma px; negative values grow the same way). */
export function designCss(n: number) {
  const size = `clamp(${Math.abs(n)}px, ${Math.abs(n)} / 1720 * 100vw, ${Math.abs(n)} / 1720 * 100vw)`;
  return n < 0 ? `calc(-1 * ${size})` : size;
}
