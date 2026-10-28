// 404 (Figma: Page 404.pdf, 1440 × 830). A place is [x, y] in Figma px of that frame (labels: their baseline's start)
// and [x, y] in a phone's 390 × 740 frame (no Figma frame for it: the same composition, the 404 at 0.398 of its size
// across the width less 15 px a side, the words around it).
export const FRAME = { desktop: [1440, 830], phone: [390, 740] } as const;

// the "4" as Figma draws it (Aeonik, 500 px, #A9B7A0), from its own box
export const FOUR = {
  path: 'M260.5 0v233.5h60V280h-60v120h-50V280h-181v-66l144-214zM73 228.5v5h137.5V5.5h14z',
  viewBox: '29.5 0 291 400',
  size: [291, 400],
};

const PHONE_SCALE = 0.398;
const phone = (x: number, y: number) => [15 + (x - 267.5) * PHONE_SCALE, 250 + (y - 165) * PHONE_SCALE];

export const FOURS = [
  { desktop: [267.5, 165], phone: phone(267.5, 165) },
  { desktop: [881.5, 165], phone: phone(881.5, 165) },
];

// the station's silhouette in Figma's render (its alpha, measured): the 3D is framed on it
export const ZERO = { desktop: [577.8, 144.1], phone: phone(577.8, 144.1), size: [281.6, 440.7] };

// on its side the sentence keeps its px while the frame shrinks: the two under it move out to the corners
export const LABELS: { text: string; desktop: number[]; phone: number[]; landscape?: number[] }[] = [
  { text: 'Awkward', desktop: [965, 108], phone: [288, 206] },
  { text: 'Page not found', desktop: [158, 195], phone: [15, 160] },
  { text: 'Ooops', desktop: [1332, 450], phone: [318, 470] },
  { text: 'Error', desktop: [79, 495], phone: [38, 452] },
  { text: 'Try again', desktop: [261, 701], phone: [30, 694], landscape: [70, 760] },
  { text: 'Nothing here', desktop: [1145, 697], phone: [262, 708], landscape: [1230, 770] },
];

// the sentence's first baseline and the buttons' top
export const TEXT = {
  lines: ['This page couldn’t keep its structure but rest of the', 'collection is doing just fine.'],
  desktop: 656,
  phone: 532,
};
export const BUTTONS = { desktop: 729, phone: 588 };
