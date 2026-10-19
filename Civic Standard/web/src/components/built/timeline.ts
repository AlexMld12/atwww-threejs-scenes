import { clamp01, designPx, easeInOut, smooth } from '@/lib/design';

// In screens of scroll after the stage is pinned (the hero's photo is full screen at 0).
export const TIMELINE = {
  mask: [0, 0.5],
  intro: [0.35, 0.95],
  // Item i → i + 1 happens over [start, start + length].
  changes: [1.5, 3.1],
  changeLength: 0.8,
  // Pinned length; the section is one screen longer, for the stage to scroll away.
  pinned: 4.6,
};

// Figma px: titles above the active one stack from the top, the active one sits lower, the next one waits at the bottom.
const STACK_TOP = 90.7;
const STACK_STEP = 113;
const ACTIVE_GAP = 212;
const NEXT_FROM_BOTTOM = 850 - 733.7;
export const INACTIVE = 0.3;

const span = ([a, b]: readonly number[], t: number) => clamp01((t - a) / (b - a));

export const maskAt = (screens: number) => smooth(span(TIMELINE.mask, screens));
export const introAt = (screens: number) => easeInOut(span(TIMELINE.intro, screens));

/** Active index as a continuous value: 0 … items − 1, eased through each change. */
export function activeAt(screens: number) {
  return TIMELINE.changes.reduce(
    (sum, start) => sum + easeInOut(span([start, start + TIMELINE.changeLength], screens)),
    0,
  );
}

/** Title top (CSS px) and opacity of item `k` while item `active` (an integer) is shown. */
function slot(k: number, active: number, stageHeight: number) {
  if (k < active) return { top: designPx(STACK_TOP + k * STACK_STEP), opacity: INACTIVE };
  if (k === active) {
    const top = active === 0 ? STACK_TOP : STACK_TOP + (active - 1) * STACK_STEP + ACTIVE_GAP;
    return { top: designPx(top), opacity: 1 };
  }
  const next = stageHeight - designPx(NEXT_FROM_BOTTOM);
  if (k === active + 1) return { top: next, opacity: INACTIVE };
  return { top: next + designPx(STACK_STEP), opacity: 0 };
}

/** The same, between two layouts: `active` may be fractional. */
export function titleAt(k: number, active: number, stageHeight: number) {
  const from = Math.floor(active);
  const u = active - from;
  const a = slot(k, from, stageHeight);
  if (u === 0) return a;
  const b = slot(k, from + 1, stageHeight);
  return { top: a.top + (b.top - a.top) * u, opacity: a.opacity + (b.opacity - a.opacity) * u };
}

/** Text + buttons of item `k`: gone before the titles move, back after they settle. */
export const bodyAt = (k: number, active: number) => smooth(clamp01(1 - Math.abs(active - k) / 0.35));
