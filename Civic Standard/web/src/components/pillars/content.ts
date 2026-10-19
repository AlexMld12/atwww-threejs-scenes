// Figma: Civic Standard.pdf, frame 5930–6739. Words by their pen position (x) and baseline, pills by their box;
// x is in Figma px of the 1440 frame, laid out from its centre.
export const PILLARS = [
  { word: 'Solid', x: 574, baseline: 276.95, label: 'Quiet lines, no noise', pill: { x: 940, y: 250 } },
  { word: 'Civic', x: 399.8, baseline: 446.95, label: 'Built to stay out', pill: { x: 763.8, y: 420 } },
  { word: 'Calm', x: 529.5, baseline: 616.95, label: 'For everyone who sits down', pill: { x: 907, y: 580 } },
];

// The background lines (1 px, #2F4A3A at 15 %), each written in the direction it draws and numbered in the order it
// does (as the reference: the right one up from below, then the middle one, then the left one). The left one sits on
// the left edge; the right ones on the right edge (x from 1440 − 456), and run on into the next section.
export const LEFT_LINES = [{ order: 2, d: 'M-1 675L191.3 770.9V574.2L-1 474.4' }];
export const RIGHT_LINES = [
  { order: 0, d: 'M254.4 1120.1V478L456 377.6' },
  { order: 1, d: 'M1.5 1120.1V322.7L456 95.5' },
];
