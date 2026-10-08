/** The shop's content. Foam Cleanser is the Figma copy; Serum and Cream follow its template (copy written to match, to be confirmed). */

export interface Product {
  slug: string;
  name: string;
  /** The name as set in the titles (Figma spaces FOAM  CLEANSER with two spaces). */
  title: string;
  /** The cart line's subtitle (Figma: "K1/COOL"). */
  code: string;
  step: number;
  image: string;
  price: number;
  /** One line on the cards, a longer one on the product page. */
  summary: string;
  lead: string;
  active: string;
  when: string;
  size: string;
  details: string;
  specs: [label: string, value: string][];
  howTo: string[];
  inci: string;
  pairs: string;
  faq: { question: string; answer: string }[];
  /** Right column of More Informations. */
  notes: string[];
}

export interface ComingSoon {
  name: string;
  summary: string;
}

export const PRODUCTS: Product[] = [
  {
    slug: 'foam-cleanser',
    name: 'Foam Cleanser',
    title: 'Foam  Cleanser',
    code: 'K1/COOL',
    step: 1,
    image: '/images/shop/product-k1.webp',
    price: 45.54,
    summary: 'Lifts sweat, sunscreen and city residue without stripping. A cool finish that resets skin.',
    lead: 'Lifts sweat, sunscreen and city residue without stripping. A cool finish that resets skin for the next step.',
    active: 'Centella, Menthyl Lactate',
    when: 'Morning + evening',
    size: '150 ml',
    details:
      'The formula is built around Centella Asiatica and Panthenol, two ingredients known for calming skin that has been through a lot. Menthyl Lactate adds a gentle cooling sensation as you rinse, so the first thing you feel is the temperature dropping. No squeaky finish, no tightness afterwards.',
    specs: [
      ['Skin type', 'All skin types'],
      ['Scent', 'Fragrance-free'],
      ['When', 'Morning and evening, and after training'],
      ['Texture', 'Light, airy foam with a cool finish'],
      ['Size', '150 ml, about 60 days of daily use'],
      ['PAO', '6 months after opening'],
    ],
    howTo: [
      'Wet your face with lukewarm water.',
      'Pump two doses of foam into your palm and massage over your face for 30 seconds.',
      'Rinse with cool water and pat dry.',
      'Follow with K2 Active Serum while skin is still slightly damp.',
    ],
    inci: 'Aqua, Sodium Cocoyl Isethionate, Glycerin, Centella Asiatica Extract, Menthyl Lactate, Panthenol, Allantoin, Aloe Barbadensis Leaf Juice, Phenoxyethanol.',
    pairs: 'K2 Active Serum, K3 Barrier Cream, Recovery Kit',
    faq: [
      {
        question: 'Does it remove sunscreen and makeup?',
        answer: 'It removes sunscreen and light makeup. For long-wear makeup, use a cleansing balm first, then K1.',
      },
      {
        question: 'Is the cooling feeling strong?',
        answer: 'No. Menthyl Lactate gives a gentle cool as you rinse, and it fades within a minute.',
      },
      {
        question: 'Can I use it after training?',
        answer:
          'Yes. It is made for it: morning, evening and straight after a session, to clear sweat before it settles.',
      },
    ],
    notes: [
      'The formula is built around Centella Asiatica and Panthenol, two ingredients known for calming skin that has been through a lot. Menthyl Lactate adds a gentle cooling sensation as you rinse, so the first thing you feel is the temperature dropping. No squeaky finish, no tightness afterwards.',
      'The formula is built around Centella Asiatica and Panthenol, two ingredients known for calming skin that has been through a lot.',
    ],
  },
  {
    slug: 'active-serum',
    name: 'Active Serum',
    title: 'Active Serum',
    code: 'K2/CALM',
    step: 2,
    image: '/images/shop/product-k2.webp',
    price: 45.54,
    summary: 'Takes the edge off redness and visible stress. Lightweight, absorbs fast.',
    lead: 'Takes the edge off redness and visible stress. Lightweight, absorbs fast.',
    active: 'Niacinamide 5%, Azelaic Acid',
    when: 'Evening, morning optional',
    size: '30 ml',
    details:
      'Niacinamide at 5% and Azelaic Acid work on the redness that heat and stress leave behind, while Madecassoside supports skin that feels reactive. The texture is a light, water-based gel that sinks in within seconds, so it sits comfortably under the Barrier Cream and never feels sticky.',
    specs: [
      ['Skin type', 'All skin types, including reactive'],
      ['Scent', 'Fragrance-free'],
      ['When', 'Evening, morning optional'],
      ['Texture', 'Lightweight gel, absorbs fast'],
      ['Size', '30 ml, about 60 days of daily use'],
      ['PAO', '6 months after opening'],
    ],
    howTo: [
      'Cleanse with K1 Foam Cleanser and leave skin slightly damp.',
      'Press one pump into your fingertips and pat it over the face and neck.',
      'Give it a minute to absorb.',
      'Seal with K3 Barrier Cream.',
    ],
    inci: 'Aqua, Niacinamide, Propanediol, Azelaic Acid, Glycerin, Madecassoside, Panthenol, Sodium Hyaluronate, Xanthan Gum, Phenoxyethanol.',
    pairs: 'K1 Foam Cleanser, K3 Barrier Cream, Recovery Kit',
    faq: [
      {
        question: 'Can I use it in the morning?',
        answer:
          'Yes. Evening is the base routine; on hot days or after training, add a morning pump and follow with sunscreen.',
      },
      {
        question: 'Will it make my skin tingle?',
        answer: 'Rarely, and only for the first few uses. If it persists, use it every other evening for a week.',
      },
      {
        question: 'Can I combine it with retinol or acids?',
        answer: 'Use them on alternate evenings rather than together, so the barrier is not overloaded.',
      },
    ],
    notes: [
      'Niacinamide at 5% and Azelaic Acid work on the redness that heat and stress leave behind, while Madecassoside supports skin that feels reactive. A light gel that sinks in within seconds.',
      'Built to sit between K1 and K3: it treats, the cream seals.',
    ],
  },
  {
    slug: 'barrier-cream',
    name: 'Barrier Cream',
    title: 'Barrier Cream',
    code: 'K3/SEAL',
    step: 3,
    image: '/images/shop/product-k3.webp',
    price: 45.54,
    summary: 'Locks hydration in and rebuilds the barrier overnight. Soft, never heavy.',
    lead: 'Locks hydration in and rebuilds the barrier overnight. Soft, never heavy.',
    active: 'Ceramide NP, Beta-Glucan',
    when: 'Morning + evening, last step',
    size: '50 ml',
    details:
      'Ceramide NP replaces what heat, sweat and cleansing take out of the skin barrier, Squalane softens without a greasy film and Beta-Glucan holds water in through the night. It is the last step: a soft cream that seals everything underneath and leaves skin calm by morning.',
    specs: [
      ['Skin type', 'All skin types, best for dry and tight skin'],
      ['Scent', 'Fragrance-free'],
      ['When', 'Morning + evening, last step'],
      ['Texture', 'Soft cream, never heavy'],
      ['Size', '50 ml, about 60 days of daily use'],
      ['PAO', '12 months after opening'],
    ],
    howTo: [
      'Apply after K2 Active Serum, once it has absorbed.',
      'Warm a pea-sized amount between your fingertips.',
      'Press it into the face and neck, from the centre outwards.',
      'In the morning, follow with sunscreen.',
    ],
    inci: 'Aqua, Caprylic/Capric Triglyceride, Glycerin, Squalane, Cetearyl Alcohol, Ceramide NP, Beta-Glucan, Cholesterol, Sodium Hyaluronate, Tocopherol, Phenoxyethanol.',
    pairs: 'K1 Foam Cleanser, K2 Active Serum, Recovery Kit',
    faq: [
      {
        question: 'Is it rich enough for very dry skin?',
        answer: 'Yes. On very dry areas, add a second thin layer in the evening.',
      },
      {
        question: 'Will it clog pores?',
        answer:
          'The formula is built around light emollients and skin-identical lipids, chosen not to sit heavy on the skin.',
      },
      {
        question: 'Can I use it under makeup?',
        answer: 'Yes. Give it a few minutes to settle, then apply sunscreen and makeup as usual.',
      },
    ],
    notes: [
      'Ceramide NP replaces what heat, sweat and cleansing take out of the barrier, Squalane softens without a greasy film and Beta-Glucan holds water in through the night.',
      'The last step of the routine: it seals K1 and K2 in.',
    ],
  },
];

export const CATEGORIES = [
  { id: 'all', label: 'All Products' },
  { id: 'kelv', label: 'KELV Skincare' },
  { id: 'serum', label: 'Serum' },
  { id: 'cleanser', label: 'Cleanser' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const GROUPS: { id: Exclude<CategoryId, 'all'>; label: string; products?: Product[]; soon?: ComingSoon[] }[] = [
  { id: 'kelv', label: 'KELV Skincare', products: PRODUCTS },
  {
    id: 'serum',
    label: 'Serum',
    soon: [
      {
        name: 'Serum Xbionic',
        summary: 'A post-training serum that cools flushed skin fast and calms it before it settles red.',
      },
      {
        name: 'Face Serum',
        summary: 'A daily hydrating serum for skin that tightens in dry air, heating or AC.',
      },
    ],
  },
  {
    id: 'cleanser',
    label: 'Cleanser',
    soon: [
      {
        name: 'Gel Cleanser',
        summary: 'A clear gel cleanser for oily and shine-prone skin, built for hot days and humid cities.',
      },
      {
        name: 'Cleansing Balm',
        summary: 'Melts long-wear makeup and water-resistant sunscreen before K1, without leaving a film.',
      },
    ],
  },
];

export const GOALS = ['Focus', 'Calm', 'Energy', 'Glow', 'Recovery', 'Resilience', 'Heat', 'Stamina'];

export const FREE_SHIPPING = 100;

export function productBySlug(slug: string) {
  return PRODUCTS.find((product) => product.slug === slug);
}

export function formatPrice(value: number) {
  return `€${value.toFixed(2)}`;
}
