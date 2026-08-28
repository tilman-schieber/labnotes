import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUANTITY_SOURCE, conversionsFor, convert, formatQuantity, parseQuantity } from './quantity.ts';

test('parses value and unit, normalising aliases and decimal commas', () => {
  assert.deepEqual(parseQuantity('12.5 mL'), { value: 12.5, unit: 'mL' });
  assert.deepEqual(parseQuantity('12,5mL'), { value: 12.5, unit: 'mL' });
  assert.deepEqual(parseQuantity('3 uL'), { value: 3, unit: 'µL' });
  assert.deepEqual(parseQuantity('3 μl'), { value: 3, unit: 'µL' });
  assert.deepEqual(parseQuantity('-20 °C'), { value: -20, unit: '°C' });
  assert.deepEqual(parseQuantity('2 equiv'), { value: 2, unit: 'eq' });
  assert.deepEqual(parseQuantity('50%'), { value: 50, unit: '%' });
});

test('rejects non-quantities', () => {
  assert.equal(parseQuantity('hello'), null);
  assert.equal(parseQuantity('12 apples'), null);
  assert.equal(parseQuantity('12'), null);
});

test('longest unit token wins', () => {
  assert.deepEqual(parseQuantity('5 mmol'), { value: 5, unit: 'mmol' });
  assert.deepEqual(parseQuantity('5 mol'), { value: 5, unit: 'mol' });
  assert.deepEqual(parseQuantity('5 min'), { value: 5, unit: 'min' });
  assert.deepEqual(parseQuantity('5 mM'), { value: 5, unit: 'mM' });
});

test('converts within a dimension', () => {
  assert.deepEqual(convert({ value: 2.5, unit: 'mL' }, 'µL'), { value: 2500, unit: 'µL' });
  assert.deepEqual(convert({ value: 1500, unit: 'mg' }, 'g'), { value: 1.5, unit: 'g' });
  assert.deepEqual(convert({ value: 25, unit: '°C' }, 'K'), { value: 298.15, unit: 'K' });
  assert.deepEqual(convert({ value: 298.15, unit: 'K' }, '°C'), { value: 25, unit: '°C' });
  assert.deepEqual(convert({ value: 1.5, unit: 'h' }, 'min'), { value: 90, unit: 'min' });
});

test('refuses cross-dimension conversion', () => {
  assert.throws(() => convert({ value: 1, unit: 'g' }, 'mL'), /Cannot convert mass to volume/);
});

test('formats without floating-point noise', () => {
  assert.equal(formatQuantity(convert({ value: 0.1, unit: 'g' }, 'mg')), '100 mg');
  assert.equal(formatQuantity({ value: 1 / 3, unit: 'mol' }), '0.333333 mol');
  assert.equal(formatQuantity({ value: 50, unit: '%' }), '50%');
  assert.equal(formatQuantity({ value: -20, unit: '°C' }), '-20 °C');
});

test('conversion suggestions stay in dimension and sane range', () => {
  const suggestions = conversionsFor({ value: 2, unit: 'mL' });
  assert.ok(suggestions.some((item) => item.unit === 'µL' && item.value === 2000));
  assert.ok(suggestions.some((item) => item.unit === 'L' && item.value === 0.002));
  assert.ok(!suggestions.some((item) => item.unit === 'g'));
});

test('regex source matches trailing quantity in prose', () => {
  const rule = new RegExp(`(?:^|\\s)${QUANTITY_SOURCE}\\s$`);
  assert.ok(rule.test('add 12.5 mL '));
  assert.ok(rule.test('heat to -20 °C '));
  assert.ok(!rule.test('12.5 mLx '), 'unit must be followed by whitespace');
  assert.ok(!rule.test('x12 g '), 'number must start a word');
});
