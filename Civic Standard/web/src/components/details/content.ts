// Figma: Civic Standard.pdf, THE DETAILS 6739–7339 and OUR VALUES 7339–8391. y from each section's top (its rule),
// baselines for text; x in Figma px of the 1440 frame (the left column from the left edge, the right one from the
// centre). Lines are Figma's line breaks.
export const DETAILS = {
  text: [
    'Every Civic Standard piece starts as a few',
    'repeatable parts: a steel frame, recycled',
    'boards and a few fixings. We draw each part',
    'in detail, render it in its final finish before',
    'anything is made, and test how it sits in a real',
    'square. The result is a range cities can specify',
    'fast, assemble on site and repair part by part.',
  ],
  textBaseline: 387,
  cards: [
    // close-ups in the colleague's product studio (tools/blender_details.py)
    {
      x: 630,
      title: 'Board detail',
      caption: 'In section',
      image: '/details/board.webp',
      alt: 'The ends of a bench’s recycled seat boards, in section',
    },
    {
      x: 1029,
      title: 'Frame corner',
      caption: 'Metallised',
      image: '/details/corner.webp',
      alt: 'The galvanised steel armrest of a bench, bending into its frame',
    },
  ],
  cardTop: 46,
  cardTitleBaseline: 533,
  cardCaptionBaseline: 549,
};

export const VALUES = {
  statement: [
    'Calm is how we shape a square as',
    'much as how we shape a bench,',
    'present in every line we draw, every joint',
    'we weld and every colour we pick.',
  ],
  statementBaseline: 60,
  rows: [
    {
      label: 'Solid',
      rule: 287,
      baseline: 326,
      text: [
        'Solid is more than heavy steel—it is how a bench behaves',
        'after years of daily use. Frames are metallised before painting,',
        'boards are reinforced inside, and every part can be replaced',
        'on site. That is how we give cities furniture they can rely on for',
        'many years.',
      ],
    },
    {
      label: 'Civic',
      rule: 463,
      baseline: 502,
      text: [
        'Civic means designed for everyone who passes by. Seats at',
        'the right height, armrests where they help, nothing that',
        'pushes people away. Through civic design, we turn leftover',
        'corners into places where people actually choose to stay.',
      ],
    },
    {
      label: 'Calm',
      rule: 618,
      baseline: 657,
      text: [
        'Calm defines the way our pieces sit in a street as much as the',
        'way they are built. It shows in quiet frames, honest materials',
        'and colours that belong outside. Through calm, we let the city',
        'stay the main character while our furniture simply does its job.',
      ],
    },
  ],
  services: [
    { title: 'Fabrication', text: 'Cuts, bends and finishes every frame in our own workshop.' },
    { title: 'Quoting', text: 'Turns your site layout into one clear price.' },
    { title: 'Site Fitting', text: 'Fixes and levels every piece on location.' },
    { title: 'Aftercare Service', text: 'Supplies spare parts for years after.' },
  ],
  serviceBaseline: 802,
  serviceStep: 65,
};
