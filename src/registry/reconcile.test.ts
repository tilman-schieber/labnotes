import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestMatches } from './reconcile.ts';

const known = [
  { id: 'lb', type: 'reagent', label: 'Lysis Buffer', aliases: ['Buffer', 'LB'] },
  { id: 'lb2', type: 'reagent', label: 'Lysis buffer 2x', aliases: [] },
  { id: 'sa', type: 'sample', label: 'Sample A', aliases: ['Specimen A'] },
  { id: 'cx', type: 'compound', label: 'Compound X', aliases: [] },
  { id: 'ir', type: 'instrument', label: 'Centrifuge', aliases: [] }
];

test('exact and near-exact names rank first', () => {
  const found = suggestMatches('lysis-buffer', known);
  assert.equal(found[0].entity.id, 'lb');
  assert.equal(found[0].score, 1);
  assert.equal(found[1].entity.id, 'lb2');
});

test('aliases match with a small penalty and a reason', () => {
  const found = suggestMatches('Specimen A', known);
  assert.equal(found[0].entity.id, 'sa');
  assert.ok(found[0].reason.includes('alias'));
  assert.ok(found[0].score < 1 && found[0].score > 0.9);
});

test('typos within two edits are suggested, unrelated names are not', () => {
  const found = suggestMatches('Centrifug', known);
  assert.deepEqual(found.map((item) => item.entity.id), ['ir']);
  assert.deepEqual(suggestMatches('Sodium chloride', known), []);
});
