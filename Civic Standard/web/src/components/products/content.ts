import grid from './grid.json';

// PRODUCTS (Figma: Products.pdf, 1440 × 6542; the grid's cards read from it by tools/extract_products_page.py). The
// sections after the grid are the home's (configurator, built to stay, footer).

export interface Card {
  col: number;
  row: number;
  w: number;
  h: number;
  name?: string;
  tag?: string;
  finish?: string;
  measure?: string;
  id?: string;
  /** The render's square in % of the card: left, top, size. */
  image?: number[];
  catalogue?: boolean;
}

// Every product has the configurator's palette: the galvanised ones (K7) show its first colour, as there. Figma's
// empty card is left out (all 23 products are on the page).
export const CARDS = (grid.cards as Card[])
  .filter((card) => card.id || card.catalogue)
  .map((card) => (card.finish === 'Natural Galvanised Steel' ? { ...card, finish: 'Anthracite' } : card));
export const PRODUCT_COUNT = CARDS.filter((card) => card.id).length;

// A category card names its products by their tag.
export const CATEGORIES = grid.categories.map((category) => ({
  ...category,
  tag: category.name.toUpperCase(),
}));

// The shop palette (the configurator's), in Figma's order.
export const SWATCHES = [
  { name: 'Anthracite', colour: '#383e42' },
  { name: 'Petrol', colour: '#416772' },
  { name: 'Sage', colour: '#7e9186' },
  { name: 'Warm white', colour: '#f1ece1' },
  { name: 'Accent Orange', colour: '#f44611' },
];

export const TITLE = ['Our own designs, made for', 'squares, parks and streets'];

// y in Figma px from the page's top
export const LAYOUT = {
  titleBaselines: [169.2, 234.2],
  navRule: 91.2,
  filterBaseline: 421.2,
  filterRule: 447.2,
  categoriesTop: 473.2,
  categoryStep: 148,
  countRule: 793.2,
  countBaseline: 831.2,
  valueX: 188,
  gridTop: 858.2,
  gridBottomGap: 100,
};
