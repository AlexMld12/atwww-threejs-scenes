export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Design px → CSS px, the same rule as the clamp() tokens: fixed below 1720 px, fluid above. */
export const designScale = () => Math.max(1, window.innerWidth / 1720);

/** A design px value as the clamp() expression used by the CSS tokens. */
export function designLength(px: number) {
  const abs = Math.abs(px);
  const vw = (abs / 17.2).toFixed(5);
  const value = `clamp(${abs}px, ${vw}vw, ${vw}vw)`;
  return px < 0 ? `calc(-1 * ${value})` : value;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
