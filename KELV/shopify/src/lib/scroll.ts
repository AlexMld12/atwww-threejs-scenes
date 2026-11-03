import Lenis from 'lenis';
import { setFrameScroll } from './layout';
import { isTouch, sampleFrame } from './quality';

type FrameCallback = (now: number) => void;

const FONT_TIMEOUT_MS = 2000;

const callbacks = new Set<FrameCallback>();
const bootedWaiters: (() => void)[] = [];
const readyWaiters: (() => void)[] = [];
let lenis: Lenis | null = null;
let booted = false;
let ready = false;

/** The loop runs one way: footer → hero. Scrolling up past the top of a lap stops there instead of wrapping. */
function preventUpwardWrap(instance: Lenis) {
  const scrollTo = instance.scrollTo.bind(instance);
  instance.scrollTo = (target, options) => {
    // Only while the loop is on: elsewhere (the shop) the bottom is `limit` itself, which would read as a lap start.
    if (
      instance.options.infinite &&
      options?.programmatic === false &&
      typeof target === 'number' &&
      instance.limit > 0
    ) {
      const lapStart = Math.floor(instance.targetScroll / instance.limit) * instance.limit;
      target = Math.max(target, lapStart);
    }
    scrollTo(target, options);
  };
}

/** Native (touch) scrolling cannot wrap: at the end, where the hero copy fills the screen, it jumps to the real hero. */
function wrapNativeScroll(instance: Lenis) {
  if (!instance.options.infinite || instance.limit <= 0) return;
  const y = window.scrollY;
  if (y >= instance.limit - 0.5) window.scrollTo(0, y - instance.limit);
}

/** Starts Lenis and the single animation frame loop; `loop` is the footer → hero wrap-around (the home only). */
export function startScroll({ loop }: { loop: boolean }) {
  // drinksom.eu's options, except touch: native scrolling there (a JS-driven one lagged on phones).
  const touch = isTouch();
  const instance = new Lenis({
    lerp: 0.14,
    smoothWheel: true,
    infinite: loop,
    syncTouch: !touch,
    syncTouchLerp: 0.1,
    touchMultiplier: 1,
    // Their Lenis (1.3.17) predates this option: the scroll stays smooth with reduced motion on.
    respectReducedMotion: false,
  });
  preventUpwardWrap(instance);
  lenis = instance;

  requestAnimationFrame(function tick(now) {
    sampleFrame(now);
    instance.raf(now);
    if (touch) wrapNativeScroll(instance);
    setFrameScroll();
    for (const callback of callbacks) callback(now);
    requestAnimationFrame(tick);
  });

  const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
  void Promise.race([document.fonts.ready, timeout]).then(() => {
    document.documentElement.classList.add('is-ready');
    // Two frames later, so the hidden state is painted before it changes.
    requestAnimationFrame(() => requestAnimationFrame(() => settle(bootedWaiters, () => (booted = true))));
  });
  return instance;
}

function settle(waiters: (() => void)[], mark: () => void) {
  mark();
  for (const waiter of waiters.splice(0)) waiter();
}

export const getLenis = () => lenis;

/** Turns the footer → hero wrap-around on or off (off while a layer is the page). */
export function setLoop(enabled: boolean) {
  if (lenis) lenis.options.infinite = enabled;
}

/** Runs `callback` on every animation frame, after Lenis has updated the scroll position. */
export function onFrame(callback: FrameCallback) {
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}

/** Fonts are in and the hidden first frame has been painted: the preloader can start. */
export function whenBooted(callback: () => void) {
  if (booted) callback();
  else bootedWaiters.push(callback);
}

/** The page is revealed (the preloader leaving): reveals and the hero intro start. */
export function whenReady(callback: () => void) {
  if (ready) callback();
  else readyWaiters.push(callback);
}

export const isReady = () => ready;

export function reveal() {
  if (!ready) settle(readyWaiters, () => (ready = true));
}
