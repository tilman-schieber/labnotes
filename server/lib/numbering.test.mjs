import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatExperimentNumber, initialsFor, nextExperimentNumber, normaliseInitials, planBackfill } from './numbering.mjs';

test('initials from a display name', () => {
  assert.equal(initialsFor('Tilman Schieber'), 'TS');
  assert.equal(initialsFor('Ana María López'), 'AML');
  assert.equal(initialsFor('Researcher'), 'RE');
  assert.equal(initialsFor('J.-P. Sartre'), 'JPS');
  assert.equal(initialsFor(''), '');
  assert.equal(initialsFor(null), '');
});

test('stored initials are upper-case letters and digits, at most six', () => {
  assert.equal(normaliseInitials(' ts '), 'TS');
  assert.equal(normaliseInitials('t.s.2'), 'TS2');
  assert.equal(normaliseInitials('abcdefgh'), 'ABCDEF');
  assert.equal(normaliseInitials('--'), null);
});

test('the next number follows the highest sibling, ignoring gaps and junk', () => {
  assert.equal(nextExperimentNumber([]), 1);
  assert.equal(nextExperimentNumber([{ metadata: { number: 3 } }, { metadata: { number: 1 } }]), 4);
  assert.equal(nextExperimentNumber([{ metadata: { number: 'x' } }, { metadata: {} }]), 1);
  assert.equal(formatExperimentNumber(7), '007');
  assert.equal(formatExperimentNumber(1234), '1234');
});

test('backfill numbers unnumbered experiments per project in creation order, keeping existing numbers', () => {
  const documents = [
    { id: 'p1', kind: 'project', parentId: 'g', createdAt: '2026-01-01' },
    { id: 'e1', kind: 'experiment', parentId: 'p1', createdAt: '2026-01-02', metadata: {} },
    { id: 'e2', kind: 'experiment', parentId: 'p1', createdAt: '2026-01-03', metadata: { number: 5 } },
    { id: 'e3', kind: 'experiment', parentId: 'p1', createdAt: '2026-01-04', metadata: {} },
    { id: 'e4', kind: 'experiment', parentId: 'p2', createdAt: '2026-01-01', metadata: {} }
  ];
  assert.deepEqual(planBackfill(documents), [
    { id: 'e1', number: 6 },
    { id: 'e3', number: 7 },
    { id: 'e4', number: 1 }
  ]);
});
