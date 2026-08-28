import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractUsages, summariseUsages } from './usages.ts';

const text = (value: string) => ({ type: 'text', text: value });
const entity = (id: string, label: string, entityType = 'compound') => ({ type: 'entityMention', attrs: { id, label, entityType } });
const qty = (value: number, unit: string) => ({ type: 'quantity', attrs: { value, unit } });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const doc = (...blocks: object[]) => ({ type: 'doc', content: blocks });

test('parenthetical amounts after the entity', () => {
  const usages = extractUsages(doc(paragraph(entity('sa', 'Salicylic acid'), text(' ('), qty(2, 'g'), text(', '), qty(14.5, 'mmol'), text(') was dissolved in '), entity('aa', 'Acetic anhydride'), text(' ('), qty(5, 'mL'), text(').'))));
  assert.equal(usages.length, 2);
  assert.deepEqual(usages[0].quantities, [{ value: 2, unit: 'g' }, { value: 14.5, unit: 'mmol' }]);
  assert.equal(usages[0].role, 'reactant');
  assert.deepEqual(usages[1].quantities, [{ value: 5, unit: 'mL' }]);
  assert.equal(usages[1].role, 'solvent');
});

test('leading amounts with "of"', () => {
  const usages = extractUsages(doc(paragraph(text('Add '), qty(12.5, 'mL'), text(' of '), entity('x', 'Compound X'), text(' and '), qty(2, 'eq'), text(' '), entity('b', 'Base'), text('.'))));
  assert.deepEqual(usages.map((u) => [u.label, u.quantities]), [
    ['Compound X', [{ value: 12.5, unit: 'mL' }]],
    ['Base', [{ value: 2, unit: 'eq' }]]
  ]);
});

test('time and temperature are conditions, not amounts', () => {
  const usages = extractUsages(doc(paragraph(text('Stir '), entity('x', 'X'), text(' for '), qty(10, 'min'), text(' at '), qty(80, '°C'), text('.'))));
  assert.deepEqual(usages[0].quantities, []);
  assert.equal(usages[0].role, null);
});

test('product keywords assign the product role', () => {
  const usages = extractUsages(doc(paragraph(text('Work-up afforded '), entity('p', 'Aspirin'), text(' ('), qty(1.8, 'g'), text(', 75%).'))));
  assert.equal(usages[0].role, 'product');
  assert.deepEqual(usages[0].quantities, [{ value: 1.8, unit: 'g' }]);
});

test('sentences isolate bindings; nearest entity takes leftovers', () => {
  const usages = extractUsages(doc(paragraph(text('Weigh '), entity('a', 'A'), text('. Then '), qty(3, 'g'), text(' were added to '), entity('b', 'B'), text('.'))));
  assert.deepEqual(usages.map((u) => [u.label, u.quantities.length]), [['A', 0], ['B', 1]]);
});

test('nested list items are read; reaction blocks are skipped', () => {
  const usages = extractUsages(
    doc(
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(qty(1, 'g'), text(' '), entity('a', 'A'))] }] },
      { type: 'reaction', attrs: { components: [{ entityId: 'zzz', label: 'ignored' }] } }
    )
  );
  assert.deepEqual(usages.map((u) => u.label), ['A']);
});

test('summarise keeps first amount per dimension and the first known role', () => {
  const usages = extractUsages(
    doc(paragraph(qty(2, 'g'), text(' of '), entity('a', 'A'), text('.')), paragraph(text('More '), entity('a', 'A'), text(' ('), qty(1, 'g'), text(', '), qty(5, 'mL'), text(').')))
  );
  const summary = summariseUsages(usages);
  assert.equal(summary.length, 1);
  assert.deepEqual(summary[0].quantities, [{ value: 2, unit: 'g' }, { value: 5, unit: 'mL' }]);
});
