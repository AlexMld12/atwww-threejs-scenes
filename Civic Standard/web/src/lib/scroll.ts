import Lenis from 'lenis';
import { onHandover } from './intro';

// Every input (wheel, touchpad, finger, its fling, keys) adds to one wanted position; each frame Lenis is sent only as
// far as the shown scroll + MAX_AHEAD screens, so the page has a top speed (≈ MAX_AHEAD × lerp × 60 screens/s) and
// can't skip what the hero is still drawing. What is wanted beyond QUEUE screens ahead is dropped, not queued.
const MAX_AHEAD = 0.45;
const QUEUE = 1.2;
const WHEEL_LERP = 0.1;
const TOUCH_LERP = 1;
const FLING_LERP = 0.075;
// As Lenis: a fling travels |velocity in px per frame| ^ this.
const FLING_EXPONENT = 1.7;
const LINE_PX = 48;
const PAGE = 0.9;

// Stops a section wants the page to rest at (BUILT OUTSIDE's items). Between the first and the last, one gesture is one
// step: it takes the page to the next stop in STEP_S and the rest of that gesture (a touchpad's inertia, a long wheel
// spin, the finger's drag) is dropped. A gesture is new after a pause, a turn, or a clear surge over the last delta.
const STEP_S = 0.8;
const GESTURE_GAP_MS = 160;
const GESTURE_SURGE = 1.6;
const TOUCH_STEP_PX = 30;
const SNAP_IDLE_MS = 180;
const AT_PX = 3;

let lenis: Lenis | null = null;
let wanted = 0;
let lerp = WHEEL_LERP;
// Only input moves the page from here; a native scroll (find in page, a link) is left alone.
let pending = false;
let touchVelocity = 0;
let touchTime = 0;
let touchDrag = 0;
let touching = false;
// The furthest the page may go for now (the hero holds it while the bench turns to the front).
let gate: () => number = () => Infinity;
let stops: () => number[] = () => [];
// When the step under way ends at the latest, should Lenis not report it (a resize, a stop).
let stepUntil = 0;
let consumed = false;
let lastWheelAt = 0;
let lastWheelSize = 0;
let lastWheelSign = 0;
let direction = 1;
let lastInput = 0;

const screen = () => window.innerHeight;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const isStepping = () => performance.now() < stepUntil;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Adds to the wanted position, from where the page is if it had come to rest. */
function want(delta: number, nextLerp: number) {
  if (!lenis) return;
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

/** Inside the stops, the next stop in `dir` from the shown scroll; null outside them, undefined past the last one. */
function nextStop(dir: number) {
  const list = stops();
  if (!lenis || !list.length) return null;
  const shown = lenis.animatedScroll;
  if (shown < list[0] - AT_PX || shown > list[list.length - 1] + AT_PX) return null;
  return dir > 0 ? list.find((stop) => stop > shown + AT_PX) : list.findLast((stop) => stop < shown - AT_PX);
}

function step(to: number) {
  if (!lenis) return;
  stepUntil = performance.now() + STEP_S * 1000 + 150;
  consumed = true;
  pending = false;
  wanted = to;
  lenis.scrollTo(to, {
    duration: STEP_S,
    easing: easeInOut,
    programmatic: false,
    onComplete: () => (stepUntil = 0),
  });
}

/** One input: a step between the stops (only for a new gesture), free scrolling elsewhere. */
function input(delta: number, isNew: boolean, nextLerp: number) {
  if (!delta) return;
  lastInput = performance.now();
  direction = Math.sign(delta);
  const next = nextStop(direction);
  if (next === null && !isStepping()) {
    want(delta, nextLerp);
    // A gesture that scrolls freely is used up once it reaches the stops: its inertia can't step on from there.
    if (stops().length) consumed = true;
    return;
  }
  if (isStepping() || (consumed && !isNew)) return;
  consumed = false;
  // Past the first or the last stop: a new gesture leaves the stops and scrolls freely.
  if (next === undefined || next === null) want(delta, nextLerp);
  else step(next);
}

function isNewWheelGesture(delta: number, now: number) {
  const size = Math.abs(delta);
  const sign = Math.sign(delta);
  const isNew =
    now - lastWheelAt > GESTURE_GAP_MS || sign !== lastWheelSign || size > lastWheelSize * GESTURE_SURGE + 4;
  lastWheelAt = now;
  lastWheelSize = size;
  lastWheelSign = sign;
  return isNew;
}

function drive() {
  requestAnimationFrame(drive);
  if (!lenis || lenis.isStopped || isStepping()) return;
  const shown = lenis.animatedScroll;
  const now = performance.now();
  const list = stops();

  if (list.length) {
    const first = list[0];
    const last = list[list.length - 1];
    // Coming in from outside, the page stops at the first stop it meets.
    if (shown < first - AT_PX && direction > 0) wanted = Math.min(wanted, first);
    if (shown > last + AT_PX && direction < 0) wanted = Math.max(wanted, last);
    // Left between two stops (a resize, a native scroll): on to the next one as soon as the input pauses.
    const at = list.some((stop) => Math.abs(stop - shown) < AT_PX);
    const between = shown > first + AT_PX && shown < last - AT_PX;
    if (between && !at && !touching && now - lastInput > SNAP_IDLE_MS) {
      const next = nextStop(direction);
      if (next !== null && next !== undefined) step(next);
      return;
    }
  }

  if (!pending) return;
  const ahead = MAX_AHEAD * screen();
  wanted = Math.min(wanted, Math.max(gate(), shown));
  const to = clamp(wanted, shown - ahead, shown + ahead);
  if (Math.abs(wanted - shown) < 0.5) pending = false;
  else if (Math.abs(to - lenis.targetScroll) > 0.5) lenis.scrollTo(to, { lerp, programmatic: false });
}

function onVirtualScroll({ deltaY, event }: { deltaY: number; event: WheelEvent | TouchEvent }) {
  if (!lenis || lenis.isStopped || event.ctrlKey) return true;
  if (event.cancelable) event.preventDefault();
  const now = performance.now();
  touching = event.type !== 'touchend' && event.type.startsWith('touch');
  if (event.type === 'touchstart') {
    touchVelocity = 0;
    touchTime = now;
    touchDrag = 0;
    consumed = false;
    // A tap stops a fling where it is (not a step: that one ends on its own).
    if (!isStepping()) wanted = lenis.animatedScroll;
  } else if (event.type === 'touchmove') {
    // px per 60 Hz frame, as Lenis measures a fling.
    touchVelocity = (deltaY / Math.max(now - touchTime, 1)) * (1000 / 60);
    touchTime = now;
    touchDrag += deltaY;
    // Between the stops a drag is one step once it is long enough; elsewhere the page follows the finger.
    const next = nextStop(Math.sign(touchDrag));
    if (next === null || next === undefined) input(deltaY, !consumed, TOUCH_LERP);
    else if (Math.abs(touchDrag) > TOUCH_STEP_PX) input(touchDrag, !consumed, TOUCH_LERP);
  } else if (event.type === 'touchend') {
    // A finger that stopped before lifting does not fling; nor does one that has just made a step.
    if (now - touchTime < 100 && !consumed && !isStepping()) {
      input(Math.sign(touchVelocity) * Math.abs(touchVelocity) ** FLING_EXPONENT, false, FLING_LERP);
    }
  } else {
    input(deltaY, isNewWheelGesture(deltaY, now), WHEEL_LERP);
  }
  return false;
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
  input(delta, true, WHEEL_LERP);
}

/** One Lenis for the page, locked until the preloader is gone. */
export function startScroll() {
  if (lenis) return lenis;
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  lenis = new Lenis({ autoRaf: true, syncTouch: true, virtualScroll: onVirtualScroll });
  lenis.stop();
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(drive);
  onHandover(() => lenis?.start());
  return lenis;
}

/** The hero says how far the page may scroll for now; the returned function lifts that gate (if still its own). */
export function setScrollGate(next: () => number) {
  gate = next;
  return () => {
    if (gate === next) gate = () => Infinity;
  };
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
