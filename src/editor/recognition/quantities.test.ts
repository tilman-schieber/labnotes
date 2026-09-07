import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findQuantities, quantityInputMatch } from './quantities.ts';

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

test('input rule matches a quantity ended by whitespace or by the punctuation of bracket notation', () => {
  assert.deepEqual(quantityInputMatch('Add 25 mg '), { quantity: { value: 25, unit: 'mg' }, trailing: ' ', start: 4, end: 9 });
  assert.deepEqual(quantityInputMatch('acid (10.0 mmol,'), { quantity: { value: 10, unit: 'mmol' }, trailing: ',', start: 6, end: 15 });
  assert.deepEqual(quantityInputMatch('1.0 equiv)'), { quantity: { value: 1, unit: 'eq' }, trailing: ')', start: 0, end: 9 });
  assert.deepEqual(quantityInputMatch('reflux for 4 h.')?.quantity, { value: 4, unit: 'h' });
  assert.deepEqual(quantityInputMatch('at 0 °C;')?.quantity, { value: 0, unit: '°C' });
  assert.equal(quantityInputMatch('Figure 2 shows '), null);
  assert.equal(quantityInputMatch('sample 3d.'), null, 'glued single-letter unit before punctuation is a label');
  assert.deepEqual(quantityInputMatch('sample 3d ')?.quantity, { value: 3, unit: 'd' });
  assert.equal(quantityInputMatch('25 mg'), null, 'nothing typed after the unit yet');
});
