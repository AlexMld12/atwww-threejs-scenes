// Logica quiz-ului Skin Analysis — sursa: „KELV° Skin Reading · quiz logic for development"
// (@Simin, 2026-10-06). Modul PUR (fără DOM): pașii, citirea, profilul, planul, ID-ul kitului.
// Cazurile de test din document (5 seturi) trec — vezi `CASES` la final; se rulează cu
// `node web/src/analysis/logic.test.mjs`.
//
// ⚠️ Temperatura se calculează în SUTIMI ÎNTREGI, nu în zecimale: în JS 34.35 ar deveni
// 34.3 în loc de 34.4 (cazul 1, pasul 3 trebuie să dea 33.9°, nu 33.8°).

// ---- pașii ----
// `title` / `sub`: din Figma acolo unde ecranul există. ⚠️ Macheta are doar 6 ecrane de
// întrebări numerotate „din 7" și sare pasul „routine"; titlurile lipsă sunt marcate PROVIZORIU.
// `why`: textul din „Why we ask" NU e nici în Figma, nici în document — PROVIZORIU, scris
// din regulile documentului (ce face răspunsul în plan).
export const STEPS = [
  {
    key: 'type', kind: 'single',
    title: 'How does your skin feel by midday?',
    sub: 'Choose the answer that fits most days.',
    why: 'Your skin type sets the starting point of your reading and the notes in your routine.',
    options: [
      { key: 'dry', label: 'Tight or dry', t: 30 },
      { key: 'tzone', label: 'Shiny in the T-zone', t: 40 },
      { key: 'oily', label: 'Shiny all over', t: 60 },
      { key: 'balanced', label: 'Comfortable, no shine or tightness', t: 0 },
      { key: 'unsure', label: "I'm not sure", t: 20 },
    ],
  },
  {
    key: 'sens', kind: 'single',
    title: 'How does your skin react to new products?',
    sub: 'Think about the last few products you tried.',
    why: 'Reactive skin gets a gentler start: K2 only in the evening, every other night at first.',
    options: [
      { key: 'rarely', label: 'It rarely reacts', t: 0 },
      { key: 'sometimes', label: 'It sometimes reacts', t: 40 },
      { key: 'often', label: 'It often stings or turns red', t: 80 },
      { key: 'unsure', label: "I'm not sure", t: 20 },
    ],
  },
  {
    key: 'heat', kind: 'multi',
    title: 'What heats your skin up?',
    sub: 'Choose all that apply.',
    why: 'Every source of heat raises your reading. Three or more add K2 to your mornings.',
    options: [
      { key: 'sun', label: 'Sun and time outdoors', t: 35 },
      { key: 'training', label: 'Training and sweat', t: 35 },
      { key: 'sauna', label: 'Sauna and hot showers', t: 35 },
      { key: 'indoor', label: 'Dry air from heating or AC', t: 35 },
      { key: 'city', label: 'City commute and pollution', t: 35 },
      { key: 'stress', label: 'Stress and short nights', t: 35 },
    ],
  },
  {
    key: 'signs', kind: 'multi',
    // PROVIZORIU: în Figma ecranul are titlul pasului „routine" (eroare de machetă)
    title: 'How does the heat show up on your skin?',
    sub: 'Choose all that apply.',
    why: 'What you see on your skin decides your skin profile in the reading.',
    options: [
      { key: 'red', label: 'Redness that stays', t: 25 },
      { key: 'shine', label: 'Shine and clogged pores', t: 25 },
      { key: 'tight', label: 'Tightness or dehydration', t: 25 },
      { key: 'spots', label: 'Breakouts', t: 25 },
      // exclusiv: deselectează celelalte, iar orice altă opțiune o deselectează pe ea
      { key: 'none', label: 'Nothing in particular', t: 0, exclusive: true },
    ],
  },
  {
    key: 'routine', kind: 'single',
    // titlul e cel din Figma de pe ecranul 4 — îi aparține acestui pas
    title: 'What does your routine look like today?',
    sub: 'Be honest. There is no wrong answer.',
    why: 'If you are starting from zero, we bring the three steps in one at a time.',
    options: [
      { key: 'none', label: "I don't have one", t: 0 },
      { key: 'one', label: 'Just a cleanser', t: 0 },
      { key: 'few', label: 'Two or three steps', t: 0 },
      { key: 'full', label: 'Four steps or more', t: 0 },
    ],
  },
  {
    key: 'goal', kind: 'single',
    title: 'What should KELV° fix first?',
    sub: 'Be honest. There is no wrong answer.',
    why: 'Your goal sets the focus of your routine.',
    options: [
      { key: 'calm', label: 'Calm the redness', t: 0 },
      { key: 'shine', label: 'Control the shine', t: 0 },
      { key: 'hydrate', label: 'Bring back hydration', t: 0 },
      { key: 'barrier', label: 'Strengthen my barrier', t: 0 },
      { key: 'simple', label: 'Simplify my routine', t: 0 },
    ],
  },
  {
    key: 'contact', kind: 'form',
    title: 'Where should we send your reading?',
    sub: 'Optional. You can see your reading right away either way.',
  },
];
export const QUESTION_KEYS = STEPS.filter((s) => s.kind !== 'form').map((s) => s.key);

// Bara de progres: 4 etape. 01 = pașii 1–2, 02 = 3–4, 03 = 5–6, 04 = pasul 7 + raportul.
// Unitățile sunt indici de pas (0-based); raportul e unitatea 7.
export const STAGES = [
  { label: '01 Your skin', units: [0, 1] },
  { label: '02 Heat', units: [2, 3] },
  { label: '03 Routine', units: [4, 5] },
  { label: '04 Reading', units: [6, 7] },
];

export function emptyAnswers() {
  return { type: null, sens: null, heat: [], signs: [], routine: null, goal: null, name: '', email: '', consent: false };
}

export function isAnswered(a, key) {
  const v = a[key];
  if (key === 'contact') return !!(a.name.trim() || a.email.trim());
  return Array.isArray(v) ? v.length > 0 : v != null;
}

// ---- citirea ----
const TYPE = { dry: 30, tzone: 40, oily: 60, balanced: 0, unsure: 20 };
const SENS = { rarely: 0, sometimes: 40, often: 80, unsure: 20 };

// null = încă niciun răspuns (indicatorul arată „––.–°")
export function skinReading(a) {
  const any = QUESTION_KEYS.some((k) => isAnswered(a, k));
  if (!any) return null;
  let h = 3200;                                   // sutimi de grad
  h += TYPE[a.type] ?? 0;
  h += SENS[a.sens] ?? 0;
  h += Math.min(6, a.heat.length) * 35;
  h += a.signs.filter((s) => s !== 'none').length * 25;
  const tenths = Math.round(h / 10);              // h e întreg, deci fără erori
  return Math.min(356, Math.max(324, tenths)) / 10;
}
export const fmt = (t) => t.toFixed(1);

// ---- profilul ----
export function band(t) {
  if (t < 33) return { key: 'baseline', label: 'Close to baseline', line: 'Your skin is close to baseline. The routine keeps it there.' };
  if (t < 34) return { key: 'warm', label: 'Running warm', line: 'Your skin is running warm. The routine below brings it back to 28.0°C.' };
  if (t < 35) return { key: 'hot', label: 'Running hot', line: 'Your skin is running hot. The routine below brings it back to 28.0°C.' };
  return { key: 'over', label: 'Overheated', line: 'Your skin is overheated. Start gently: the routine below brings it back to 28.0°C.' };
}

export function skinType(a) {
  const s = a.signs;
  if (s.includes('red')) return { key: 'reactive', desc: 'Heat shows up as redness that stays.' };
  if (s.includes('spots') || s.includes('shine') || a.type === 'oily' || a.type === 'tzone') return { key: 'congested', desc: 'Heat shows up as shine and clogged pores.' };
  if (s.includes('tight') || a.type === 'dry') return { key: 'dehydrated', desc: 'Heat pulls water out of your skin.' };
  return { key: 'balanced', desc: 'Your skin handles heat well. Keep it that way.' };
}

// „{Name}, your skin…" — prima literă a frazei devine mică după virgulă
export function bandLine(t, name) {
  const line = band(t).line;
  const n = name.trim();
  return n ? `${n}, ${line[0].toLowerCase()}${line.slice(1)}` : line;
}

// ---- planul ----
export function k2Both(a) {
  return a.sens !== 'often' && (a.heat.length >= 3 || a.heat.includes('sun') || a.heat.includes('training'));
}

const FOCUS = {
  calm: 'Calm the redness first.',
  shine: 'Control the shine first.',
  hydrate: 'Bring back hydration first.',
  barrier: 'Strengthen the barrier first.',
  simple: 'Keep it to three simple steps.',
};

const NOTES = [
  [(a) => a.sens === 'often', 'Use K2 every other evening for the first two weeks, then every evening.'],
  [(a) => a.routine === 'none', 'Start with K1 and K3 for three days, then add K2.'],
  [(a) => a.heat.includes('training'), 'Use K1 within 30 minutes after training, before sweat dries on your skin.'],
  [(a) => a.heat.includes('sauna'), 'After a sauna, rinse with cool water and wait ten minutes before K2.'],
  [(a) => a.type === 'oily' || a.type === 'tzone' || a.signs.includes('shine'), 'In the morning, one pump of K3 is enough. Press it in rather than rubbing.'],
  [(a) => a.type === 'dry' || a.signs.includes('tight'), 'At night, add a second pump of K3 on the driest areas.'],
  [(a) => a.heat.includes('sun'), 'K3 is not a sunscreen. Keep your SPF as the last step in the morning.'],
];
const NOTE_DEFAULT = 'Follow the routine for 28 days, then take a new reading to compare.';

export function plan(a) {
  const t = skinReading(a);
  const both = k2Both(a);
  const notes = NOTES.filter(([f]) => f(a)).map(([, n]) => n).slice(0, 4);
  return {
    reading: t,
    band: band(t),
    type: skinType(a),
    profile: `${band(t).label}, ${skinType(a).key}`,
    focus: `${FOCUS[a.goal] ?? ''} Three steps, morning and evening.`.trim(),
    products: [
      { code: 'K1', name: 'Foam Cleanser', when: 'Morning and evening', text: 'Lifts sweat, sunscreen and city residue without stripping. Rinse cool.' },
      both
        ? { code: 'K2', name: 'Active Serum', when: 'Evening and morning', text: 'Your heat load is high, so use one pump in the morning too.' }
        : { code: 'K2', name: 'Active Serum', when: 'Evening only', text: 'Press one pump into clean skin and let it settle for a minute.' },
      { code: 'K3', name: 'Barrier Cream', when: 'Morning and evening, last step', text: 'Seals the routine in and rebuilds the barrier overnight.' },
    ],
    k2: both ? 'am+pm' : 'pm',
    notes: notes.length ? notes : [NOTE_DEFAULT],
    subscription: t >= 34 || a.heat.length >= 3,
    k2Offer: a.routine === 'full' && a.goal !== 'simple',
    kitId: kitId(a),
  };
}

// ---- ID-ul kitului: din răspunsuri (fără nume/email), cheile în ordinea pașilor ----
export function kitId(a) {
  const o = { type: a.type, sens: a.sens, heat: a.heat, signs: a.signs, routine: a.routine, goal: a.goal };
  const json = JSON.stringify(o);
  let h = 7;
  for (const c of json) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 'K-' + String(h % 10000).padStart(4, '0');
}

// zz.ll.aa
export function calibrated(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

// ---- e-mail ----
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const ERR_EMAIL = 'Check the email address. It needs an @ and a domain, like name@example.com.';
export const ERR_CONSENT = 'Add an email so we can send your reading, or untick the box.';
