import catalogue from '../product/catalogue.json';

// CONFIGURATOR (Figma: Customize - Section.pdf, … - Bins.pdf; 1440 × 850). The products are the colleague's catalogue
// (DEVELOPER_STUDIO_2026-10-20); LAYOUT runs through a category's products, the left dot only tells a measure.
// Lengths and capacities as the catalogue gives them (produse_shop.json).

export interface Finish {
  id: string;
  name: string;
  note: string;
  hex: string;
}

// The shop palette (catalogue: palette_decision). Only anthracite has a RAL match in the catalogue.
export const PALETTE: Finish[] = [
  { id: 'anthracite', name: 'Anthracite grey', note: 'RAL 7016', hex: '#383E42' },
  { id: 'petrol', name: 'Petrol', note: 'Matte finish', hex: '#416772' },
  { id: 'sage', name: 'Sage', note: 'Matte finish', hex: '#7E9186' },
  { id: 'warm_white', name: 'Warm White', note: 'Matte finish', hex: '#F1ECE1' },
  { id: 'orange_accent', name: 'Accent Orange', note: 'Matte finish', hex: '#F44611' },
];

export interface Product {
  id: string;
  name: string;
  measure: [label: string, value: string];
}

export const CATEGORIES: { name: string; products: Product[] }[] = [
  {
    name: 'Seating',
    products: [
      { id: 'K7_armrests', name: 'Plaza bench with armrests', measure: ['Length', '2M'] },
      { id: 'K7_noArmrests', name: 'Plaza bench with backrest', measure: ['Length', '2M'] },
      { id: 'K6_1400', name: 'Frame bench with armrests', measure: ['Length', '1,4M'] },
      { id: 'K5_1400', name: 'Frame bench with backrest', measure: ['Length', '1,4M'] },
      { id: 'K4_1400', name: 'Frame backless bench', measure: ['Length', '1,4M'] },
      { id: 'G2_std', name: 'Frame park bench', measure: ['Length', '1,9M'] },
      { id: 'G6_std', name: 'Reuse bench with backrest', measure: ['Length', '1,99M'] },
      { id: 'G7_std', name: 'Plaza backless bench', measure: ['Length', '2M'] },
      { id: 'G8_std', name: 'Reuse wide bench', measure: ['Length', '1,99M'] },
      { id: 'G3_std', name: 'Frame bench with bike stand', measure: ['Length', '1,91M'] },
    ],
  },
  {
    name: 'Recycling',
    products: [
      { id: 'K3_Q600', name: 'Frame recycling station', measure: ['Volume', '140L'] },
      { id: 'K3_R900', name: 'Frame recycling station', measure: ['Volume', '105L'] },
      { id: 'G1_std', name: 'Frame litter bin', measure: ['Volume', '45L'] },
      { id: 'K2_single', name: 'Frame recycling bin', measure: ['Volume', '35L'] },
    ],
  },
  {
    name: 'Greenery',
    products: [
      { id: 'K1_Q700', name: 'Frame square planter', measure: ['Volume', '262L'] },
      { id: 'K1_Q950', name: 'Frame square planter', measure: ['Volume', '423L'] },
      { id: 'K1_R1500', name: 'Frame long planter', measure: ['Volume', '170L'] },
    ],
  },
];

/** The products loaded while the preloader runs: each category's first, so every tab opens at once. */
export const FIRST = CATEGORIES.map(({ products }) => products[0].id);

// THE CONFIGURATOR'S PAGE (Configurator.pdf, Quote Open.pdf): the same products and palette, the products no tab
// names under Seating, the model's other sizes, and the quote's line for a pick.
const entryOf = (id: string) => catalogue.find((p) => p.id === id);

export const PAGE_CATEGORIES = CATEGORIES.map((category, i) =>
  i > 0
    ? category
    : {
        ...category,
        products: [
          ...category.products,
          { id: 'G4_std', name: 'Plaza sun lounger', measure: ['Length', '2M'] as [string, string] },
          { id: 'G5_std', name: 'Plaza picnic table', measure: ['Length', '1,9M'] as [string, string] },
          { id: 'K8_module', name: 'Plaza bike rack', measure: ['Length', '2,07M'] as [string, string] },
        ],
      },
);

/** The tab and the layout showing a product: its model's entry (K6_1900 is K6_1400's other size). */
export function locate(id: string) {
  const sizes = entryOf(id)?.sizes.map((size) => size.id) ?? [id];
  // the product's own layout first (K7 without armrests is a layout of its own, and K7's other size)
  for (const match of [(p: Product) => p.id === id, (p: Product) => sizes.includes(p.id)])
    for (let category = 0; category < PAGE_CATEGORIES.length; category++) {
      const layout = PAGE_CATEGORIES[category].products.findIndex(match);
      if (layout >= 0) return { category, layout };
    }
  return { category: 0, layout: 0 };
}

export const finishById = (id: string) => PALETTE.find((f) => f.id === id) ?? PALETTE[0];

/** A size's measure: the model's own for its first size, the length (or the entry's) for the others. */
export function measureOf(id: string, product: Product): [string, string] {
  if (product.id === id || product.measure[0] !== 'Length') return product.measure;
  const length = entryOf(id)?.dimensions[0] ?? 0;
  return ['Length', `${String(+(length / 1000).toFixed(2)).replace('.', ',')}M`];
}

/** Figma's quote list writes names as a sentence: "Plaza bench with armrests". */
export function nameOf(id: string) {
  const name = entryOf(id)?.name ?? id;
  return name.charAt(0) + name.slice(1).toLowerCase();
}
export const dimensionsOf = (id: string) => entryOf(id)?.dimensions ?? [];
export const sizesOf = (id: string) => entryOf(id)?.sizes ?? [];

/** Quote Open.pdf: "1900 mm, painted steel, Anthracite grey RAL 7016". */
export function describe(id: string, finishId: string) {
  const finish = finishById(finishId);
  const length = `${dimensionsOf(id)[0]} mm`;
  const ral = finish.note.startsWith('RAL') ? ` ${finish.note}` : '';
  return `${length}, painted steel, ${finish.name}${ral}`;
}
