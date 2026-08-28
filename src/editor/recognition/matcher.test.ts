import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMatcher, findRecognitions } from './matcher.ts';

const matcher = buildMatcher([
  { id: 'lb', type: 'reagent', label: 'Lysis Buffer', aliases: ['Buffer', 'LB'] },
  { id: 'sa', type: 'sample', label: 'Sample A', aliases: [] },
  { id: 'cx', type: 'compound', label: 'Compound X', aliases: ['Cmpd X'] }
]);

test('matches labels and aliases case-insensitively on word boundaries', () => {
  const found = findRecognitions('Add lysis buffer to sample a, then more BUFFER.', matcher);
  assert.deepEqual(found.map((r) => [r.matched, r.entityId]), [
    ['lysis buffer', 'lb'],
    ['sample a', 'sa'],
    ['BUFFER', 'lb']
  ]);
});

test('longest name wins and partial words do not match', () => {
  const found = findRecognitions('Lysis Buffers are not Lysis Buffer; Buffered saline is not Buffer.', matcher);
  assert.deepEqual(found.map((r) => [r.start, r.matched]), [
    [22, 'Lysis Buffer'],
    [59, 'Buffer']
  ]);
});

test('words inside a pending #/@ query are left to the popup; short aliases are ignored', () => {
  assert.deepEqual(findRecognitions('#Lysis Buffer and @Sample A and LB', matcher), []);
  // After the clause ends the popup is gone, so recognition resumes.
  assert.deepEqual(
    findRecognitions('#Lysis Buffer. Then sample a again', matcher).map((r) => r.matched),
    ['sample a']
  );
});

test('empty registry yields no matcher', () => {
  assert.deepEqual(findRecognitions('anything', buildMatcher([])), []);
});
