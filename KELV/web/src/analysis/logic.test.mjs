// Cazurile de test din documentul de logică (@Simin, 2026-10-06). Rulează:
//   node web/src/analysis/logic.test.mjs
import { emptyAnswers, skinReading, plan, fmt } from './logic.js';

const ALL_HEAT = ['sun', 'training', 'sauna', 'indoor', 'city', 'stress'];
const CASES = [
  // [răspunsuri, citire, profil, k2, note (prefixe), abonament, ofertă K2, kit ID]
  [['tzone', 'sometimes', ['sun', 'training', 'city'], ['red', 'shine'], 'few', 'calm'], '34.4', 'Running hot, reactive', 'am+pm', ['Use K1', 'In the morning', 'K3 is not'], true, false, 'K-3595'],
  [['balanced', 'rarely', ['indoor'], ['none'], 'full', 'simple'], '32.4', 'Close to baseline, balanced', 'pm', ['Follow the routine'], false, false, 'K-9816'],
  [['oily', 'often', ALL_HEAT, ['red', 'shine', 'tight', 'spots'], 'none', 'barrier'], '35.6', 'Overheated, reactive', 'pm', ['Use K2 every', 'Start with K1', 'Use K1', 'After a sauna'], true, false, 'K-9470'],
  [['dry', 'unsure', ['sauna', 'stress'], ['tight'], 'one', 'hydrate'], '33.5', 'Running warm, dehydrated', 'pm', ['After a sauna', 'At night'], false, false, 'K-2945'],
  [['balanced', 'rarely', ['city', 'indoor', 'stress'], ['spots'], 'full', 'shine'], '33.3', 'Running warm, congested', 'am+pm', ['Follow the routine'], true, true, 'K-2981'],
];

let fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`  ✗ ${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); } };
CASES.forEach(([[type, sens, heat, signs, routine, goal], reading, profile, k2, notes, sub, offer, id], i) => {
  const a = { ...emptyAnswers(), type, sens, heat, signs, routine, goal };
  const p = plan(a);
  console.log(`caz ${i + 1}: ${fmt(p.reading)} · ${p.profile} · ${p.k2} · ${p.kitId}`);
  eq('citire', fmt(p.reading), reading);
  eq('profil', p.profile.toLowerCase(), profile.toLowerCase());
  eq('k2', p.k2, k2);
  eq('note', p.notes.map((n, j) => n.startsWith(notes[j] ?? '#')), notes.map(() => true));
  eq('nr. note', p.notes.length, notes.length);
  eq('abonament', p.subscription, sub);
  eq('ofertă K2', p.k2Offer, offer);
  eq('kit id', p.kitId, id);
});
// cazul 1 pas cu pas: 32.4 → 32.8 → 33.9 → 34.4
const a = emptyAnswers();
const steps = [];
a.type = 'tzone'; steps.push(fmt(skinReading(a)));
a.sens = 'sometimes'; steps.push(fmt(skinReading(a)));
a.heat = ['sun', 'training', 'city']; steps.push(fmt(skinReading(a)));
a.signs = ['red', 'shine']; steps.push(fmt(skinReading(a)));
eq('pas cu pas', steps, ['32.4', '32.8', '33.9', '34.4']);
eq('fără răspuns', skinReading(emptyAnswers()), null);
console.log(fail ? `${fail} EȘECURI` : 'toate cazurile trec');
process.exit(fail ? 1 : 0);
