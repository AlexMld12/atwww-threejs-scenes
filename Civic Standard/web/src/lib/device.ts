// A phone or a tablet (a small screen, or a finger for a pointer): its GPU is a fraction of a desktop's while its
// screen has 2–3 device px a px, so the 3D is drawn at fewer of them and the extras are left out.
export const isHandheld = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches;

/**
 * How far above the stage's middle the screen's seen middle is (px): a phone's stage is the large viewport (100lvh,
 * so nothing jumps as its address bar comes and goes), while the bar is shown it hides the stage's foot.
 */
export function stageLift(stageHeight: number) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const seen = probe.offsetHeight;
  probe.remove();
  return Math.max(0, (stageHeight - seen) / 2);
}

/** Device px a px for a canvas: up to `desktop` on a desktop, up to `handheld` on a phone or a tablet. */
export const pixelRatio = (desktop = 2, handheld = 1.5) =>
  Math.min(window.devicePixelRatio, isHandheld() ? handheld : desktop);

// The screen's height for scroll-driven motion: on a phone innerHeight changes as the browser's address bar comes
// and goes (and with it every progress worked out from it: the photos jumped); the large viewport (100lvh) does not.
// Measured again only when the width changes (a turn of the phone), not on the bar's resizes.
let screenCache = { width: -1, height: 0 };

export function screenHeight() {
  if (typeof window === 'undefined') return 0;
  if (screenCache.width !== window.innerWidth) {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    screenCache = { width: window.innerWidth, height: probe.offsetHeight || window.innerHeight };
    probe.remove();
  }
  return screenCache.height;
}
