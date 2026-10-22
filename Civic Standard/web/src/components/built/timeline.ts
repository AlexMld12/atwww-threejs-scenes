import { clamp01, designPx, easeInOut } from '@/lib/design';

// In screens of scroll after the stage is pinned (the hero's photo is full screen at 0, its mask already on).
export const TIMELINE = {
  // The label, the bar's track and SCROLL come in; item 1 rises from the bottom to its place.
  reveal: [0, 0.5],
  arrive: [0.1, 0.9],
  // Photo i + 1 sweeps up over [start, start + length], as the titles move; before it, a strip of it shows.
  changes: [1.5, 3.1],
  changeLength: 0.8,
  peekLength: 0.5,
  // Pinned length; the section is one screen longer, for the stage to scroll away.
  pinned: 4.6,
};

/** Where each item is in its place: when the scroll pauses between two, the page settles on one (lib/scroll). */
export const STOPS = [TIMELINE.arrive[1], ...TIMELINE.changes.map((start) => start + TIMELINE.changeLength)];

// As in the reference (Valmont, Resn): the next photo shows a tenth of the screen before its edge sweeps up.
const PEEK = 0.1;

// Figma px: titles above the active one stack from the top, the active one sits lower, the next one waits at the bottom.
const STACK_TOP = 90.7;
const STACK_STEP = 113;
const ACTIVE_GAP = 212;
const NEXT_FROM_BOTTOM = 850 - 733.7;
export const INACTIVE = 0.3;

const span = ([a, b]: readonly number[], t: number) => clamp01((t - a) / (b - a));

export const revealAt = (screens: number) => easeInOut(span(TIMELINE.reveal, screens));

/** Shown share of photo `k` (k ≥ 1) from the bottom, straight from the scroll as in the reference: no easing. */
export function photoAt(k: number, screens: number) {
  const start = TIMELINE.changes[k - 1];
  const peek = span([start - TIMELINE.peekLength, start], screens);
  const sweep = span([start, start + TIMELINE.changeLength], screens);
  return PEEK * peek + (1 - PEEK) * sweep;
}

/** Where the list stands, from the scroll: −1 = item 1 waits at the bottom, k = item k + 1 is in its place. */
export const positionAt = (screens: number) =>
  -1 +
  span(TIMELINE.arrive, screens) +
  TIMELINE.changes.reduce((sum, start) => sum + span([start, start + TIMELINE.changeLength], screens), 0);

/** Title top (CSS px) and opacity of item `k` while item `active` (−1 … items − 1) is in its place. */
function slot(k: number, active: number, stageHeight: number) {
  if (k < active) return { top: designPx(STACK_TOP + k * STACK_STEP), opacity: INACTIVE };
  if (k === active) {
    const top = active === 0 ? STACK_TOP : STACK_TOP + (active - 1) * STACK_STEP + ACTIVE_GAP;
    return { top: designPx(top), opacity: INACTIVE };
  }
  const next = stageHeight - designPx(NEXT_FROM_BOTTOM);
  if (k === active + 1) return { top: next, opacity: INACTIVE };
  return { top: next + designPx(STACK_STEP), opacity: 0 };
}

/** The same at any position: the titles move with the scroll, eased through each step. */
export function titleAt(k: number, position: number, stageHeight: number) {
  const from = Math.floor(position);
  const u = easeInOut(position - from);
  const a = slot(k, from, stageHeight);
  if (u === 0) return a;
  const b = slot(k, from + 1, stageHeight);
  return { top: a.top + (b.top - a.top) * u, opacity: a.opacity + (b.opacity - a.opacity) * u };
}

// The text stays while the page is this near an item's place (in items), not only exactly on it: free scrolling
// passes through, and a little scroll while reading must not take the text away.
const ARRIVED_WITHIN = 0.35;

/** The item near its place (its text shows), or −1 while the titles are between two. */
export function arrivedAt(position: number) {
  const k = Math.round(position);
  return k >= 0 && Math.abs(position - k) < ARRIVED_WITHIN ? k : -1;
}
