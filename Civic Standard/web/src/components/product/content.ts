import { PALETTE } from '../configurator/content';
import catalogue from './catalogue.json';

// PRODUCT (Figma: Product CMS.pdf, 1440 × 9395): one page for every product of the catalogue (catalogue.json, from
// tools/prepare_product_pages.py). Figma shows the Plaza Bench with Armrests; the others fill the same places.

export type Page = (typeof catalogue)[number];

export const productBySlug = (slug: string | null) => catalogue.find((p) => p.slug === slug) ?? null;
export const slugById = (id: string) => catalogue.find((p) => p.id === id)?.slug ?? null;

// The finishes: the shop palette, as the configurator has it. Figma's K7 is shown painted sage (its render) though
// the catalogue calls it galvanised: a galvanised product starts sage, the others on their catalogue colour.
export const FINISHES = PALETTE;

export function firstFinish(page: Page) {
  // the catalogue's names are the palette's first words (Anthracite → Anthracite grey)
  const named = FINISHES.find((f) => f.name.toLowerCase().startsWith(page.finish.toLowerCase()));
  return (named ?? FINISHES.find((f) => f.id === 'sage')!).id;
}

const mm = (dims: number[]) => `${dims.join(' × ')} mm`;

/** Configuration: this product in full, the model's other sizes by their length, or by name when it is the same. */
export function sizes(page: Page) {
  return page.sizes.map((size) => {
    const current = size.id === page.id;
    const label = current
      ? mm(page.dimensions)
      : size.dimensions[0] !== page.dimensions[0]
        ? `${size.dimensions[0]} mm`
        : size.label;
    return { id: size.id, label, current, slug: slugById(size.id) };
  });
}

// y in Figma px from the page's top; x from the left edge (left column) or the right edge (the two cards)
export const HERO = {
  stage: 732,
  titleBaseline: 702.2,
  next: { x: 1177, y: 430 },
  labelBaseline: 772.1,
  finishX: 30,
  configurationX: 383.7,
  swatchesTop: 791,
  sizesTop: 784.8,
  cardsTop: 757,
  rule: 849,
  height: 851,
};

// THE BENCH (Figma 851–2849): the kind of product, a statement that fills as it is read, three pictures.
const KIND: Record<string, string> = {
  Benches: 'bench',
  'Litter and Recycling Bins': 'bin',
  Planters: 'planter',
  'Sun Loungers': 'lounger',
  'Picnic Tables': 'table',
  'Bike Racks': 'bike rack',
};
export const kindOf = (page: Page) => KIND[page.category] ?? page.category.toLowerCase();

// Figma writes K7's; the others say what the catalogue knows until their own copy comes.
const STATEMENTS: Record<string, string> = {
  K7_armrests:
    'A long bench with a full backrest and armrests at both ends, for people who sit a while and stand up with ease.',
};

export const statement = (page: Page) =>
  STATEMENTS[page.id] ??
  `${page.name}, ${page.dimensions.join(' × ')} mm, with ${page.components.toLowerCase().replace(' / ', ' and ')}, made to stay outside.`;

// y from the section's top (Figma 851), in Figma px
export const STORY = {
  labelBaseline: 933.1 - 851,
};

export const PICTURES = ['wide', 'end', 'detail'] as const;
// the SPEC SHEET's picture and the two cards' crops of it (tools/blender_gallery.py)
export type View = (typeof PICTURES)[number] | 'front' | 'row' | 'square';

// THE SHOWCASE (Figma 2857–5589): the palette's colours paint the frame and tint the section; Figma writes K7's text.
const PALETTE_STATEMENTS: Record<string, string> = {
  K7_armrests:
    'Galvanised steel and brown recycled boards: a pairing that needs no paint, no oil and very little looking after.',
};

export const paletteStatement = (page: Page) =>
  PALETTE_STATEMENTS[page.id] ??
  `${page.name} comes in the five colours of the range: anthracite, petrol, sage, warm white and accent orange.`;

// SPECIFICATIONS (Figma 5589–6709) and the two cards (7558–8443): Figma writes K7's; the others are put together from
// what the catalogue knows until their own copy comes.
export interface Specs {
  statement: string;
  rows: [string, string][];
  notes: { title: string; text: string }[];
}

const SPECS: Record<string, Specs> = {
  K7_armrests: {
    statement:
      'Two metres of seat on three steel supports, with a backrest along the whole length and armrests at both ends, made for squares and parks.',
    rows: [
      ['Material', 'Galvanised steel frame with seat and backrest in brown recycled plastic boards.'],
      ['Dimensions', 'H: 75.5 cm × W: 200 cm × D: 58.2 cm'],
      ['Finish', 'Galvanised, no paint needed'],
    ],
    notes: [
      {
        title: 'Frame',
        text: 'Three galvanised steel supports carry the full two-metre length, so the seat stays level along the whole bench.',
      },
      {
        title: 'Boards',
        text: 'Seat and backrest are made from brown recycled plastic boards, the same material used across the whole range.',
      },
      {
        title: 'Armrests',
        text: 'Armrests at both ends help people sit down and stand up. The same bench is also available without them.',
      },
    ],
  },
};

const cm = (mm: number) => `${+(mm / 10).toFixed(1)} cm`;
const galvanised = (page: Page) => page.finish.toLowerCase().includes('galvanised');

export function specs(page: Page): Specs {
  if (SPECS[page.id]) return SPECS[page.id];
  const [length, depth, height] = page.dimensions;
  // "Metal frame / body" → frame; K8's "Side supports"; K7's "None" (all galvanised)
  const part = page.paintedPart === 'Side supports' ? 'side supports' : 'frame';
  const steel = galvanised(page) ? 'Galvanised steel' : 'Powder-coated steel';
  const fixed = page.components.toLowerCase().replace(' / ', ' and ');
  const others = sizes(page).filter((size) => !size.current);
  // a bench is long; a bin or a planter is wide
  const along = ['Benches', 'Sun Loungers', 'Picnic Tables'].includes(page.category) ? 'long' : 'wide';
  const notes = [
    {
      title: part === 'frame' ? 'Frame' : 'Supports',
      text: `${steel} ${part}, ${cm(length)} ${along}, made to stay outside.`,
    },
    {
      title: page.components.includes('plastic') ? 'Boards' : 'Tubes',
      text: `${page.components.replace(' / ', ' and ')}.`,
    },
  ];
  if (page.feature) notes.push({ title: 'Capacity', text: `${page.feature}.` });
  else if (others.length)
    notes.push({ title: 'Sizes', text: `Also available: ${others.map((s) => s.label).join(', ')}.` });
  return {
    statement: `${page.name}, from the ${page.collection} range: ${cm(length)} ${along} and ${cm(height)} high, in ${steel.toLowerCase()} with ${fixed}.`,
    rows: [
      ['Material', `${steel} ${part} with ${fixed}.`],
      ['Dimensions', `H: ${cm(height)} × W: ${cm(length)} × D: ${cm(depth)}`],
      ['Finish', galvanised(page) ? 'Galvanised, no paint needed' : 'Powder-coated, in the five colours of the range'],
    ],
    notes,
  };
}

// y from the section's top (Figma 5589), in Figma px
export const SPEC = {
  labelBaseline: 5928 - 5915.2, // from the drawing's top
  sheetLabelBaseline: 6642 - 6630, // from the card's top
  // the drawing: Figma's bench is 0.4 px a millimetre; any product fits the same box, its foot on the same line
  drawing: { scale: 0.4, width: 690, height: 301.3, left: 719 },
};

const PLURAL: Record<string, string> = {
  Benches: 'benches',
  'Litter and Recycling Bins': 'bins',
  Planters: 'planters',
  'Sun Loungers': 'loungers',
  'Picnic Tables': 'tables',
  'Bike Racks': 'bike racks',
};
const RANGE = ['benches', 'planters', 'litter bins', 'a recycling station'];

export function nextSteps(page: Page) {
  if (page.id === 'K7_armrests')
    return [
      {
        title: 'Plan a Full Row',
        text: 'Line up two or three benches in the configurator, see the total length at a glance and send the whole layout as one quote.',
      },
      {
        title: 'Match the Square',
        text: 'Add planters, litter bins and a recycling station from the same range, so the whole square reads as one calm, matching set.',
      },
    ];
  const own = PLURAL[page.category] ?? 'pieces';
  const rest = RANGE.filter((item) => !item.includes(own.replace(/s$/, '')));
  return [
    {
      title: 'Plan a Full Row',
      text: `Line up two or three ${own} in the configurator, see the total length at a glance and send the whole layout as one quote.`,
    },
    {
      title: 'Match the Square',
      text: `Add ${rest.slice(0, -1).join(', ')} and ${rest.at(-1)} from the same range, so the whole square reads as one calm, matching set.`,
    },
  ];
}
