/**
 * Adaptive render scale for the 3D canvases. Frames that drew a scene are timed against frames that did not;
 * when they run clearly slower (a weak GPU), every canvas drops one resolution step. It never goes back up.
 */
const STEPS = [1, 0.8, 0.65, 0.5];
const WINDOW = 30;
const SLOW_MS = 21;
const SLOW_RATIO = 1.3;
// Longer gaps are a hidden tab or a blocked thread, not the GPU.
const MAX_SAMPLE_MS = 250;

let step = 0;
let last = 0;
let renderedLastFrame = false;
let renderedThisFrame = false;
const slow: number[] = [];
const idle: number[] = [];
const listeners = new Set<() => void>();

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/** The share of the device pixel ratio the 3D canvases render at. */
export const renderScale = () => STEPS[step];

/** Called by a scene when it drew this frame. */
export function markRendered() {
  renderedThisFrame = true;
}

/** Runs `callback` when the render scale drops. */
export function onRenderScale(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Called once per animation frame, before the scenes draw. */
export function sampleFrame(now: number) {
  const dt = now - last;
  last = now;
  const rendered = renderedLastFrame;
  renderedLastFrame = renderedThisFrame;
  renderedThisFrame = false;
  if (dt <= 0 || dt > MAX_SAMPLE_MS || step === STEPS.length - 1) return;

  const samples = rendered ? slow : idle;
  samples.push(dt);
  if (samples.length > WINDOW) samples.shift();
  if (slow.length < WINDOW) return;

  const baseline = idle.length >= 10 ? median(idle) : 1000 / 60;
  if (median(slow) > Math.max(SLOW_MS, baseline * SLOW_RATIO)) {
    step++;
    slow.length = 0;
    for (const callback of listeners) callback();
  }
}
