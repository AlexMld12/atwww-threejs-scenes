import { clamp01, designPx, easeInOut, smooth } from '@/lib/design';

// In screens of scroll after the stage is pinned (the hero's photo is full screen at 0).
export const TIMELINE = {
  mask: [0, 0.5],
  intro: [0.35, 0.95],
  // Photo i + 1 sweeps up over [start, start + length]; before it, a strip of it rises in from the bottom.
  changes: [1.5, 3.1],
  changeLength: 0.8,
  peekLength: 0.5,
  // Pinned length; the section is one screen longer, for the stage to scroll away.
  pinned: 4.6,
};

// As in the reference (Valmont, Resn): the next photo shows a tenth of the screen before its edge sweeps up.
const PEEK = 0.1;

// Figma px: titles above the active one stack from the top, the active one sits lower, the next one waits at the bottom.
const STACK_TOP = 90.7;
const STACK_STEP = 113;
const ACTIVE_GAP = 212;
const NEXT_FROM_BOTTOM = 850 - 733.7;
export const INACTIVE = 0.3;

const span = ([a, b]: readonly number[], t: number) => clamp01((t - a) / (b - a));

export const maskAt = (screens: number) => smooth(span(TIMELINE.mask, screens));
export const introAt = (screens: number) => easeInOut(span(TIMELINE.intro, screens));

/** Shown share of photo `k` (k ≥ 1) from the bottom, straight from the scroll as in the reference: no easing. */
export function photoAt(k: number, screens: number) {
  const start = TIMELINE.changes[k - 1];
  const peek = span([start - TIMELINE.peekLength, start], screens);
  const sweep = span([start, start + TIMELINE.changeLength], screens);
  return PEEK * peek + (1 - PEEK) * sweep;
}

/** The item whose text is shown: it switches halfway through its photo's sweep. */
export const indexAt = (screens: number) =>
  TIMELINE.changes.filter((start) => screens >= start + TIMELINE.changeLength / 2).length;

/** Title top (CSS px) and opacity of item `k` while item `active` is shown. */
export function slot(k: number, active: number, stageHeight: number) {
  if (k < active) return { top: designPx(STACK_TOP + k * STACK_STEP), opacity: INACTIVE };
  if (k === active) {
    const top = active === 0 ? STACK_TOP : STACK_TOP + (active - 1) * STACK_STEP + ACTIVE_GAP;
    return { top: designPx(top), opacity: 1 };
  }
  const next = stageHeight - designPx(NEXT_FROM_BOTTOM);
  if (k === active + 1) return { top: next, opacity: INACTIVE };
  return { top: next + designPx(STACK_STEP), opacity: 0 };
}
