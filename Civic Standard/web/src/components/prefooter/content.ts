// PREFOOTER (Figma: Civic Standard.pdf 10956–11726). y from the section's top: baselines for text, boxes for the
// drawings (tools/extract_drawings.py → public/prefooter); x in Figma px of the 1440 frame, from the left edge.
export const OFFICES = [
  {
    x: 30,
    title: 'Head Office',
    lines: [
      'Industrieweg 40, Unit 3, Dock B',
      '3044 AS Rotterdam, The Netherlands',
      'hello@civicstd.eu',
      '+31 10 000 0000',
    ],
  },
  {
    x: 288.8,
    title: 'Workshop',
    lines: ['Metaalweg 12, Industrial Park North,', 'Hall 6', '5928 NV Venlo, Netherlands'],
  },
  {
    x: 547.5,
    title: 'Civic Nordic',
    lines: ['Hamngatan 9, Floor 2', '211 22 Malmö', 'Skåne, Sweden', 'nordic@civicstd.eu'],
  },
  {
    x: 806.2,
    title: 'Socials',
    lines: ['Follow new projects, launches and', 'site visits as they happen.'],
    socials: ['LinkedIn', 'Facebook', 'Instagram'],
  },
];

export const MAIN_LINKS = ['Products', 'Our Projects'];
export const SUB_LINKS = [
  { x: 288.8, links: ['Careers', 'Press & Media', 'Privacy Policy', 'Warranty and Care'] },
  { x: 547.5, links: ['Downloads', 'CAD and BIM Files', 'Spec Sheets', 'Request Samples'] },
];

export const LEGAL = [
  ['Civic Standard makes furniture for squares, parks and streets.'],
  [
    'Every piece is designed, welded and finished by our own team, then delivered ready to fix, with clear drawings for the installers.',
  ],
  // wraps where the screen ends it (Figma: after "Quotes" at 1440)
  [
    'Dimensions, colours and finishes shown on this site are indicative and may vary slightly between production batches. RAL colours are reproduced as closely as screens allow; ask for physical samples before you specify. Quotes are valid for 30 days and include delivery to the site address given in your request, excluding installation.',
  ],
];

export const LAYOUT = {
  officeTitleBaseline: 277.1,
  mainBaseline: 455.7,
  subBaseline: 550.7,
  legalBaselines: [702.7, 725.7, 748.7],
  rules: [230.1, 408.7, 637.7],
  drawings: {
    benches: { x: 329, y: 74, w: 286, h: 160 },
    bin: { x: 1083, y: 118, w: 147, h: 293 },
    chair: { x: 28, y: 439, w: 147, h: 205 },
  },
};
