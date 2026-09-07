import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batchCode, experimentCode, letterFor, nextBatchLetter, parseBatchCode } from './batchCode.ts';

test('experiment codes pad the number and carry the initials', () => {
  assert.equal(experimentCode('TS', 12), 'TS-012');
  assert.equal(experimentCode('ts', 1234), 'TS-1234');
  assert.equal(experimentCode('', 7), '007');
  assert.equal(experimentCode(null, 7), '007');
  assert.equal(experimentCode('TS', null), null);
  assert.equal(experimentCode('TS', 0), null);
});

test('batch letters run A..Z, AA..', () => {
  assert.equal(letterFor(0), 'A');
  assert.equal(letterFor(25), 'Z');
  assert.equal(letterFor(26), 'AA');
  assert.equal(letterFor(27), 'AB');
  assert.equal(batchCode('TS', 12, 'a'), 'TS-012-A');
});

test('the next letter follows the highest one already used', () => {
  assert.equal(nextBatchLetter([]), 'A');
  assert.equal(nextBatchLetter(['TS-012-A']), 'B');
  assert.equal(nextBatchLetter(['TS-012-C', 'TS-012-A']), 'D');
  assert.equal(nextBatchLetter(['TS-012-Z']), 'AA');
  assert.equal(nextBatchLetter(['not a code']), 'A');
});

test('parsing a code', () => {
  assert.deepEqual(parseBatchCode('TS-012-A'), { prefix: 'TS', number: 12, letter: 'A' });
  assert.deepEqual(parseBatchCode('012-b'), { prefix: '', number: 12, letter: 'B' });
  assert.equal(parseBatchCode('Aspirin'), null);
});
