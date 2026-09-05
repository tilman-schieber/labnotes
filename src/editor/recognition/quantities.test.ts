import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findQuantities } from './quantities.ts';

test('finds amounts with and without a space, decimal comma, and negative temperatures', () => {
  const found = findQuantities('Add 25 mg and 2,5mL at -20 °C for 10 min.');
  assert.deepEqual(
    found.map((item) => [item.matched, item.quantity]),
    [
      ['25 mg', { value: 25, unit: 'mg' }],
      ['2,5mL', { value: 2.5, unit: 'mL' }],
      ['-20 °C', { value: -20, unit: '°C' }],
      ['10 min', { value: 10, unit: 'min' }]
    ]
  );
  assert.equal(found[0].start, 4);
  assert.equal(found[0].end, 9);
});

test('does not split words, decimals, ids or pending references', () => {
  assert.deepEqual(findQuantities('Figure 2 shows sample 3d and LB-100 g lots'), []);
  assert.deepEqual(findQuantities('#Buffer 2 mL pending'), []);
  assert.deepEqual(findQuantities('version 1.2 shipped'), []);
  assert.deepEqual(findQuantities('for 1.2 s').map((item) => item.quantity), [{ value: 1.2, unit: 's' }]);
  assert.deepEqual(findQuantities('use 2 M NaOH').map((item) => item.matched), ['2 M']);
});
