// A phone or a tablet (a small screen, or a finger for a pointer): its GPU is a fraction of a desktop's while its
// screen has 2–3 device px a px, so the 3D is drawn at fewer of them and the extras are left out.
export const isHandheld = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches;

/** Device px a px for a canvas: up to `desktop` on a desktop, up to `handheld` on a phone or a tablet. */
export const pixelRatio = (desktop = 2, handheld = 1.5) =>
  Math.min(window.devicePixelRatio, isHandheld() ? handheld : desktop);
