export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const MOBILE_MAX = 1023.98;
export const isMobile = () => window.innerWidth <= MOBILE_MAX;

/** Design px → CSS px, the `--u` of tokens.css: 1440 scaled on laptops, fixed to 1720, fluid above (1 on mobile). */
export function designScale() {
  const width = window.innerWidth;
  if (width <= MOBILE_MAX) return 1;
  if (width < 1440) return width / 1440;
  return Math.max(1, width / 1720);
}

/** The `--mu` of tokens.css: a 390 px phone, grown up to 1.4× on tablets. */
export const mobileUnit = () => Math.min(window.innerWidth / 390, window.innerHeight / 640, 1.4);

/** A design px value in the tokens' unit. */
export const designLength = (px: number) => `calc(${px} * var(--u))`;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
