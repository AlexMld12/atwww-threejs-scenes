// Quiz logic from "KELV° Skin Reading · quiz logic for development".

export type StepKey = 'type' | 'sens' | 'heat' | 'signs' | 'routine' | 'goal' | 'contact';
type SingleKey = 'type' | 'sens' | 'routine' | 'goal';
type MultiKey = 'heat' | 'signs';

export interface Option {
  key: string;
  label: string;
  exclusive?: boolean;
}

export type Step =
  | { key: SingleKey; kind: 'single'; title: string; sub: string; why: string; options: Option[] }
  | { key: MultiKey; kind: 'multi'; title: string; sub: string; why: string; options: Option[] }
  | { key: 'contact'; kind: 'form'; title: string; sub: string };

export interface Answers {
  type: string | null;
  sens: string | null;
  heat: string[];
  signs: string[];
  routine: string | null;
  goal: string | null;
  name: string;
  email: string;
  consent: boolean;
}

// The "signs" title and the "Why we ask" texts are placeholders until the client confirms them.
export const STEPS: Step[] = [
  {
    key: 'type',
    kind: 'single',
    title: 'How does your skin feel by midday?',
    sub: 'Choose the answer that fits most days.',
    why: 'Your skin type sets the starting point of your reading and the notes in your routine.',
    options: [
      { key: 'dry', label: 'Tight or dry' },
      { key: 'tzone', label: 'Shiny in the T-zone' },
      { key: 'oily', label: 'Shiny all over' },
      { key: 'balanced', label: 'Comfortable, no shine or tightness' },
      { key: 'unsure', label: "I'm not sure" },
    ],
  },
  {
    key: 'sens',
    kind: 'single',
    title: 'How does your skin react to new products?',
    sub: 'Think about the last few products you tried.',
    why: 'Reactive skin gets a gentler start: K2 only in the evening, every other night at first.',
    options: [
      { key: 'rarely', label: 'It rarely reacts' },
      { key: 'sometimes', label: 'It sometimes reacts' },
      { key: 'often', label: 'It often stings or turns red' },
      { key: 'unsure', label: "I'm not sure" },
    ],
  },
  {
    key: 'heat',
    kind: 'multi',
    title: 'What heats your skin up?',
    sub: 'Choose all that apply.',
    why: 'Every source of heat raises your reading. Three or more add K2 to your mornings.',
    options: [
      { key: 'sun', label: 'Sun and time outdoors' },
      { key: 'training', label: 'Training and sweat' },
      { key: 'sauna', label: 'Sauna and hot showers' },
      { key: 'indoor', label: 'Dry air from heating or AC' },
      { key: 'city', label: 'City commute and pollution' },
      { key: 'stress', label: 'Stress and short nights' },
    ],
  },
  {
    key: 'signs',
    kind: 'multi',
    title: 'How does the heat show up on your skin?',
    sub: 'Choose all that apply.',
    why: 'What you see on your skin decides your skin profile in the reading.',
    options: [
      { key: 'red', label: 'Redness that stays' },
      { key: 'shine', label: 'Shine and clogged pores' },
      { key: 'tight', label: 'Tightness or dehydration' },
      { key: 'spots', label: 'Breakouts' },
      { key: 'none', label: 'Nothing in particular', exclusive: true },
    ],
  },
  {
    key: 'routine',
    kind: 'single',
    title: 'What does your routine look like today?',
    sub: 'Be honest. There is no wrong answer.',
    why: 'If you are starting from zero, we bring the three steps in one at a time.',
    options: [
      { key: 'none', label: "I don't have one" },
      { key: 'one', label: 'Just a cleanser' },
      { key: 'few', label: 'Two or three steps' },
      { key: 'full', label: 'Four steps or more' },
    ],
  },
  {
    key: 'goal',
    kind: 'single',
    title: 'What should KELV° fix first?',
    sub: 'Be honest. There is no wrong answer.',
    why: 'Your goal sets the focus of your routine.',
    options: [
      { key: 'calm', label: 'Calm the redness' },
      { key: 'shine', label: 'Control the shine' },
      { key: 'hydrate', label: 'Bring back hydration' },
      { key: 'barrier', label: 'Strengthen my barrier' },
      { key: 'simple', label: 'Simplify my routine' },
    ],
  },
  {
    key: 'contact',
    kind: 'form',
    title: 'Where should we send your reading?',
    sub: 'Optional. You can see your reading right away either way.',
  },
];

const QUESTION_KEYS = STEPS.filter((s) => s.kind !== 'form').map((s) => s.key);

/** Progress bar: 4 stages over the 7 steps (0-based indices); the report is unit 7. */
export const STAGES = [
  { label: '01 Your skin', units: [0, 1] },
  { label: '02 Heat', units: [2, 3] },
  { label: '03 Routine', units: [4, 5] },
  { label: '04 Reading', units: [6, 7] },
];

export function emptyAnswers(): Answers {
  return {
    type: null,
    sens: null,
    heat: [],
    signs: [],
    routine: null,
    goal: null,
    name: '',
    email: '',
    consent: false,
  };
}

export function isAnswered(a: Answers, key: StepKey) {
  if (key === 'contact') return Boolean(a.name.trim() || a.email.trim());
  const value = a[key];
  return Array.isArray(value) ? value.length > 0 : value != null;
}

// ---- reading ----
const TYPE_HEAT: Record<string, number> = { dry: 30, tzone: 40, oily: 60, balanced: 0, unsure: 20 };
const SENSITIVITY_HEAT: Record<string, number> = { rarely: 0, sometimes: 40, often: 80, unsure: 20 };

/** Reading in °C, or null before the first answer; summed in hundredths so 34.35 rounds to 34.4. */
export function skinReading(a: Answers): number | null {
  if (!QUESTION_KEYS.some((key) => isAnswered(a, key))) return null;
  let hundredths = 3200;
  hundredths += TYPE_HEAT[a.type ?? ''] ?? 0;
  hundredths += SENSITIVITY_HEAT[a.sens ?? ''] ?? 0;
  hundredths += Math.min(6, a.heat.length) * 35;
  hundredths += a.signs.filter((s) => s !== 'none').length * 25;
  const tenths = Math.round(hundredths / 10);
  return Math.min(356, Math.max(324, tenths)) / 10;
}

export const formatReading = (t: number) => t.toFixed(1);

// ---- profile ----
const BANDS = [
  {
    below: 33,
    key: 'baseline',
    label: 'Close to baseline',
    line: 'Your skin is close to baseline. The routine keeps it there.',
  },
  {
    below: 34,
    key: 'warm',
    label: 'Running warm',
    line: 'Your skin is running warm. The routine below brings it back to 28.0°C.',
  },
  {
    below: 35,
    key: 'hot',
    label: 'Running hot',
    line: 'Your skin is running hot. The routine below brings it back to 28.0°C.',
  },
  {
    below: Infinity,
    key: 'over',
    label: 'Overheated',
    line: 'Your skin is overheated. Start gently: the routine below brings it back to 28.0°C.',
  },
];

export const band = (t: number) => BANDS.find((b) => t < b.below)!;

export function skinType(a: Answers) {
  const s = a.signs;
  if (s.includes('red')) return { key: 'reactive', desc: 'Heat shows up as redness that stays.' };
  if (s.includes('spots') || s.includes('shine') || a.type === 'oily' || a.type === 'tzone') {
    return { key: 'congested', desc: 'Heat shows up as shine and clogged pores.' };
  }
  if (s.includes('tight') || a.type === 'dry') return { key: 'dehydrated', desc: 'Heat pulls water out of your skin.' };
  return { key: 'balanced', desc: 'Your skin handles heat well. Keep it that way.' };
}

/** "{Name}, your skin…": the sentence continues in lower case after the name. */
export function bandLine(t: number, name: string) {
  const { line } = band(t);
  const n = name.trim();
  return n ? `${n}, ${line[0].toLowerCase()}${line.slice(1)}` : line;
}

// ---- plan ----
export function k2Morning(a: Answers) {
  return a.sens !== 'often' && (a.heat.length >= 3 || a.heat.includes('sun') || a.heat.includes('training'));
}

const FOCUS: Record<string, string> = {
  calm: 'Calm the redness first.',
  shine: 'Control the shine first.',
  hydrate: 'Bring back hydration first.',
  barrier: 'Strengthen the barrier first.',
  simple: 'Keep it to three simple steps.',
};

const NOTES: [(a: Answers) => boolean, string][] = [
  [(a) => a.sens === 'often', 'Use K2 every other evening for the first two weeks, then every evening.'],
  [(a) => a.routine === 'none', 'Start with K1 and K3 for three days, then add K2.'],
  [(a) => a.heat.includes('training'), 'Use K1 within 30 minutes after training, before sweat dries on your skin.'],
  [(a) => a.heat.includes('sauna'), 'After a sauna, rinse with cool water and wait ten minutes before K2.'],
  [
    (a) => a.type === 'oily' || a.type === 'tzone' || a.signs.includes('shine'),
    'In the morning, one pump of K3 is enough. Press it in rather than rubbing.',
  ],
  [(a) => a.type === 'dry' || a.signs.includes('tight'), 'At night, add a second pump of K3 on the driest areas.'],
  [(a) => a.heat.includes('sun'), 'K3 is not a sunscreen. Keep your SPF as the last step in the morning.'],
];
const DEFAULT_NOTE = 'Follow the routine for 28 days, then take a new reading to compare.';
const MAX_NOTES = 4;

export function plan(a: Answers) {
  const reading = skinReading(a) ?? 32;
  const morning = k2Morning(a);
  const notes = NOTES.filter(([applies]) => applies(a))
    .map(([, note]) => note)
    .slice(0, MAX_NOTES);
  const profileBand = band(reading);
  const type = skinType(a);
  return {
    reading,
    band: profileBand,
    type,
    profile: `${profileBand.label}, ${type.key}`,
    focus: `${FOCUS[a.goal ?? ''] ?? ''} Three steps, morning and evening.`.trim(),
    products: [
      {
        code: 'K1',
        name: 'Foam Cleanser',
        when: 'Morning and evening',
        text: 'Lifts sweat, sunscreen and city residue without stripping. Rinse cool.',
      },
      morning
        ? {
            code: 'K2',
            name: 'Active Serum',
            when: 'Evening and morning',
            text: 'Your heat load is high, so use one pump in the morning too.',
          }
        : {
            code: 'K2',
            name: 'Active Serum',
            when: 'Evening only',
            text: 'Press one pump into clean skin and let it settle for a minute.',
          },
      {
        code: 'K3',
        name: 'Barrier Cream',
        when: 'Morning and evening, last step',
        text: 'Seals the routine in and rebuilds the barrier overnight.',
      },
    ],
    k2: morning ? 'am+pm' : 'pm',
    notes: notes.length ? notes : [DEFAULT_NOTE],
    subscription: reading >= 34 || a.heat.length >= 3,
    k2Offer: a.routine === 'full' && a.goal !== 'simple',
    kitId: kitId(a),
  };
}

/** Kit ID from the answers only (no name or email), keys in step order. */
export function kitId(a: Answers) {
  const json = JSON.stringify({
    type: a.type,
    sens: a.sens,
    heat: a.heat,
    signs: a.signs,
    routine: a.routine,
    goal: a.goal,
  });
  let hash = 7;
  for (const c of json) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return `K-${String(hash % 10000).padStart(4, '0')}`;
}

/** dd.mm.yy */
export function calibrated(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const ERROR_EMAIL = 'Check the email address. It needs an @ and a domain, like name@example.com.';
export const ERROR_CONSENT = 'Add an email so we can send your reading, or untick the box.';
