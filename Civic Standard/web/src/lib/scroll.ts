import Lenis from 'lenis';
import { onHandover } from './intro';
import { screenHeight } from './device';

// Every wheel, touchpad and key input adds to one wanted position; each frame Lenis is sent only as far as the shown
// scroll + MAX_AHEAD screens, so the page has a top speed (≈ MAX_AHEAD × lerp × 60 screens/s) and can't outrun what
// the hero draws. What is wanted beyond QUEUE screens ahead is dropped, not queued.
// A finger scrolls natively (its own momentum, the browser's): driven through here, its touchstart was cancelled and a
// tap never became a click, and the phone did the work of a second smoothing every frame.
const MAX_AHEAD = 0.45;
const QUEUE = 1.2;
const WHEEL_LERP = 0.1;
const LINE_PX = 48;
const PAGE = 0.9;

// Stops a section wants the page to rest at (BUILT OUTSIDE's items). The scroll runs freely through them (a fast pass
// is never held); once the input has paused SETTLE_MS between two stops, the page settles on one in SETTLE_S: the next
// in the direction it went if it got past SETTLE_PAST of the way there, else back to the last.
const SETTLE_MS = 220;
const SETTLE_S = 0.7;
const SETTLE_PAST = 0.3;
const AT_PX = 3;

let lenis: Lenis | null = null;
let wanted = 0;
let lerp = WHEEL_LERP;
// Only input moves the page from here; a native scroll (find in page, a link) is left alone.
let pending = false;
let touching = false;
// the last input was a finger: its native scroll (and fling) counts as input for the stops' settling
let byTouch = false;
let stops: () => number[] = () => [];
// When the settling under way ends at the latest, should Lenis not report it (a resize).
let settleUntil = 0;
let direction = 1;
let lastInput = 0;

const screen = () => screenHeight();
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const isSettling = () => performance.now() < settleUntil;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Adds to the wanted position, from where the page is if it had come to rest. */
function want(delta: number, nextLerp: number) {
  if (!lenis || !delta) return;
  lastInput = performance.now();
  direction = Math.sign(delta);
  // new input takes over from a settling
  if (isSettling()) {
    settleUntil = 0;
    wanted = lenis.animatedScroll;
  }
  const shown = lenis.animatedScroll;
  if (!lenis.isScrolling) wanted = shown;
  wanted = clamp(
    wanted + delta,
    Math.max(0, shown - QUEUE * screen()),
    Math.min(lenis.limit, shown + QUEUE * screen()),
  );
  lerp = nextLerp;
  pending = true;
}

function settle(to: number) {
  if (!lenis) return;
  settleUntil = performance.now() + SETTLE_S * 1000 + 150;
  pending = false;
  wanted = to;
  lenis.scrollTo(to, {
    duration: SETTLE_S,
    easing: easeInOut,
    programmatic: false,
    onComplete: () => (settleUntil = 0),
  });
}

/** Between two stops: the one the page settles on, by how far it got in the direction it went. */
function settleTarget(shown: number, list: number[]) {
  const next = list.findIndex((stop) => stop > shown);
  const below = list[next - 1];
  const above = list[next];
  const share = (shown - below) / (above - below);
  return direction > 0 ? (share > SETTLE_PAST ? above : below) : share < 1 - SETTLE_PAST ? below : above;
}

function drive() {
  requestAnimationFrame(drive);
  if (!lenis || lenis.isStopped || isSettling()) return;
  const shown = lenis.animatedScroll;
  const list = stops();

  if (list.length && !touching && performance.now() - lastInput > SETTLE_MS) {
    const between = shown > list[0] + AT_PX && shown < list[list.length - 1] - AT_PX;
    const at = list.some((stop) => Math.abs(stop - shown) < AT_PX);
    if (between && !at && Math.abs(wanted - shown) < screen() * 0.02) {
      settle(settleTarget(shown, list));
      return;
    }
  }

  if (!pending) return;
  const ahead = MAX_AHEAD * screen();
  const to = clamp(wanted, shown - ahead, shown + ahead);
  if (Math.abs(wanted - shown) < 0.5) pending = false;
  else if (Math.abs(to - lenis.targetScroll) > 0.5) lenis.scrollTo(to, { lerp, programmatic: false });
}

function onVirtualScroll({ deltaY, event }: { deltaY: number; event: WheelEvent | TouchEvent }) {
  if (!lenis || lenis.isStopped || event.ctrlKey) return true;
  // a panel that scrolls itself (a project's): Lenis would see its data-lenis-prevent only after this callback
  if (event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-lenis-prevent')))
    return true;
  if (event.type.startsWith('touch')) {
    // native: nothing cancelled, the browser scrolls and taps
    touching = event.type !== 'touchend';
    byTouch = true;
    lastInput = performance.now();
    if (event.type === 'touchstart') {
      // a finger takes over from a settling or a wheel's glide
      settleUntil = 0;
      pending = false;
    }
    return true;
  }
  if (event.cancelable) event.preventDefault();
  byTouch = false;
  want(deltaY, WHEEL_LERP);
  return false;
}

// A finger's fling goes on after it lifts: the page settles once that has stopped too.
function onNativeScroll() {
  if (byTouch && !isSettling()) lastInput = performance.now();
}

// Keys scroll natively, past Lenis: they go through the same path instead.
function onKey(event: KeyboardEvent) {
  if (!lenis || lenis.isStopped || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')) return;
  const page = PAGE * screen();
  const steps: Record<string, number> = {
    ArrowDown: LINE_PX,
    ArrowUp: -LINE_PX,
    PageDown: page,
    PageUp: -page,
    ' ': event.shiftKey ? -page : page,
  };
  const delta = steps[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  want(delta, WHEEL_LERP);
}

/** One Lenis for the page, locked until the preloader is gone (or `setScrollLocked` frees it, on another page). */
export function startScroll() {
  if (lenis) return lenis;
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  lenis = new Lenis({ autoRaf: true, virtualScroll: onVirtualScroll });
  lenis.stop();
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', onNativeScroll, { passive: true });
  requestAnimationFrame(drive);
  onHandover(() => lenis?.start());
  return lenis;
}

/** Holds the page still (the preloader on the home's first visit) or lets it go. */
export function setScrollLocked(locked: boolean) {
  if (locked) lenis?.stop();
  else lenis?.start();
  document.documentElement.classList.toggle('is-scroll-free', !locked);
}

/** A section's resting points (page px); the returned function removes them (if still its own). */
export function setScrollStops(next: () => number[]) {
  stops = next;
  return () => {
    if (stops === next) stops = () => [];
  };
}

export function scrollPosition() {
  return lenis?.scroll ?? window.scrollY;
}

/** Puts the page at `y` at once (another page shown in the same document): no smoothing, nothing queued. */
export function jumpTo(y: number) {
  if (!lenis) return window.scrollTo(0, y);
  lenis.resize();
  pending = false;
  settleUntil = 0;
  wanted = y;
  lenis.scrollTo(y, { immediate: true, force: true });
}
