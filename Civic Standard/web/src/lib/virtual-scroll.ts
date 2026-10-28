// /projects has no page to scroll: the wheel, the touchpad, a finger and the keys move a position with no ends, eased
// as Lenis eases the home (lerp 0.1 a frame), and a finger's fling carries on and dies down as a native one does.
const LERP = 0.1;
const LINE_PX = 48;
const FLING_DECAY = 0.95; // a frame
const KEYS: Record<string, number> = { ArrowDown: LINE_PX, ArrowUp: -LINE_PX, PageDown: 600, PageUp: -600, ' ': 600 };

export function createVirtualScroll(target: HTMLElement, enabled: () => boolean) {
  let wanted = 0;
  let shown = 0;
  let fling = 0;
  let touchY: number | null = null;
  let lastMove = 0;

  const onWheel = (event: WheelEvent) => {
    if (!enabled() || event.ctrlKey) return;
    const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1;
    wanted += event.deltaY * unit;
  };
  const onTouchStart = (event: TouchEvent) => {
    touchY = event.touches[0].clientY;
    fling = 0;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (touchY === null || !enabled()) return;
    const y = event.touches[0].clientY;
    const now = performance.now();
    const step = touchY - y;
    wanted += step;
    // px a frame, for the fling
    fling = (step / Math.max(1, now - lastMove)) * (1000 / 60);
    lastMove = now;
    touchY = y;
  };
  const onTouchEnd = () => {
    touchY = null;
    if (performance.now() - lastMove > 80) fling = 0;
  };
  const onKey = (event: KeyboardEvent) => {
    if (!enabled() || event.altKey || event.ctrlKey || event.metaKey || !(event.key in KEYS)) return;
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select, button, [contenteditable]')) return;
    event.preventDefault();
    wanted += KEYS[event.key] * (event.key === ' ' && event.shiftKey ? -1 : 1);
  };

  target.addEventListener('wheel', onWheel, { passive: true });
  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchmove', onTouchMove, { passive: true });
  target.addEventListener('touchend', onTouchEnd);
  window.addEventListener('keydown', onKey);

  let frame = 0;
  let last = performance.now();
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const k = Math.min(3, (now - last) / (1000 / 60));
    last = now;
    if (touchY === null && Math.abs(fling) > 0.1) {
      wanted += fling * k;
      fling *= Math.pow(FLING_DECAY, k);
    }
    shown += (wanted - shown) * (1 - Math.pow(1 - LERP, k));
  };
  frame = requestAnimationFrame(tick);

  return {
    position: () => shown,
    /** Puts it at `px`, still (an open project left the tube there). */
    set(px: number) {
      wanted = shown = px;
      fling = 0;
    },
    dispose() {
      cancelAnimationFrame(frame);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKey);
    },
  };
}
