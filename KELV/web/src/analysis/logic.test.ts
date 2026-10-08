import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyAnswers, formatReading, plan, skinReading, type Answers } from './logic.ts';

const ALL_HEAT = ['sun', 'training', 'sauna', 'indoor', 'city', 'stress'];

// The five cases from the quiz logic document.
const CASES = [
  {
    answers: {
      type: 'tzone',
      sens: 'sometimes',
      heat: ['sun', 'training', 'city'],
      signs: ['red', 'shine'],
      routine: 'few',
      goal: 'calm',
    },
    reading: '34.4',
    profile: 'Running hot, reactive',
    k2: 'am+pm',
    notes: ['Use K1', 'In the morning', 'K3 is not'],
    subscription: true,
    k2Offer: false,
    kitId: 'K-3595',
  },
  {
    answers: { type: 'balanced', sens: 'rarely', heat: ['indoor'], signs: ['none'], routine: 'full', goal: 'simple' },
    reading: '32.4',
    profile: 'Close to baseline, balanced',
    k2: 'pm',
    notes: ['Follow the routine'],
    subscription: false,
    k2Offer: false,
    kitId: 'K-9816',
  },
  {
    answers: {
      type: 'oily',
      sens: 'often',
      heat: ALL_HEAT,
      signs: ['red', 'shine', 'tight', 'spots'],
      routine: 'none',
      goal: 'barrier',
    },
    reading: '35.6',
    profile: 'Overheated, reactive',
    k2: 'pm',
    notes: ['Use K2 every', 'Start with K1', 'Use K1', 'After a sauna'],
    subscription: true,
    k2Offer: false,
    kitId: 'K-9470',
  },
  {
    answers: {
      type: 'dry',
      sens: 'unsure',
      heat: ['sauna', 'stress'],
      signs: ['tight'],
      routine: 'one',
      goal: 'hydrate',
    },
    reading: '33.5',
    profile: 'Running warm, dehydrated',
    k2: 'pm',
    notes: ['After a sauna', 'At night'],
    subscription: false,
    k2Offer: false,
    kitId: 'K-2945',
  },
  {
    answers: {
      type: 'balanced',
      sens: 'rarely',
      heat: ['city', 'indoor', 'stress'],
      signs: ['spots'],
      routine: 'full',
      goal: 'shine',
    },
    reading: '33.3',
    profile: 'Running warm, congested',
    k2: 'am+pm',
    notes: ['Follow the routine'],
    subscription: true,
    k2Offer: true,
    kitId: 'K-2981',
  },
];

for (const [i, c] of CASES.entries()) {
  test(`case ${i + 1}`, () => {
    const result = plan({ ...emptyAnswers(), ...c.answers });
    assert.equal(formatReading(result.reading), c.reading);
    assert.equal(result.profile.toLowerCase(), c.profile.toLowerCase());
    assert.equal(result.k2, c.k2);
    assert.equal(result.notes.length, c.notes.length);
    result.notes.forEach((note, j) => assert.ok(note.startsWith(c.notes[j]), note));
    assert.equal(result.subscription, c.subscription);
    assert.equal(result.k2Offer, c.k2Offer);
    assert.equal(result.kitId, c.kitId);
  });
}

test('case 1, step by step', () => {
  const a: Answers = emptyAnswers();
  const steps: string[] = [];
  const read = () => steps.push(formatReading(skinReading(a)!));
  a.type = 'tzone';
  read();
  a.sens = 'sometimes';
  read();
  a.heat = ['sun', 'training', 'city'];
  read();
  a.signs = ['red', 'shine'];
  read();
  assert.deepEqual(steps, ['32.4', '32.8', '33.9', '34.4']);
});

test('no answer yet', () => {
  assert.equal(skinReading(emptyAnswers()), null);
});
