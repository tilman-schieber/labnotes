import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeConditions, extractConditions, mergeConditions } from './conditions.ts';

const text = (value: string) => ({ type: 'text', text: value });
const entity = (id: string, label: string, entityType = 'compound') => ({ type: 'entityMention', attrs: { id, label, entityType } });
const qty = (value: number, unit: string) => ({ type: 'quantity', attrs: { value, unit } });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });

test('temperature after "at/to", time after "for", atmosphere and notes', () => {
  const conditions = extractConditions([
    paragraph(text('The flask was stored at '), qty(-20, '°C'), text(' before use.')),
    paragraph(entity('h', 'H2SO4'), text(' was added dropwise at '), qty(0, '°C'), text(' under nitrogen and the mixture was heated to '), qty(80, '°C'), text(' for '), qty(4, 'h'), text(' at '), qty(500, 'rpm'), text('. Stirred '), qty(10, 'min'), text(' more.'))
  ]);
  assert.deepEqual(conditions.temperature, { value: 80, unit: '°C' }, 'the last "heated to" wins over the addition temperature');
  assert.deepEqual(conditions.time, { value: 4, unit: 'h' });
  assert.equal(conditions.atmosphere, 'N2');
  assert.deepEqual(conditions.stirring, { value: 500, unit: 'rpm' });
  assert.deepEqual(conditions.notes, ['dropwise']);
  assert.equal(conditions.temperatureLabel, null);
  assert.equal(describeConditions(conditions), '80 °C, 4 h, under N2, 500 rpm, dropwise');
});

test('reflux and room temperature are read without a number; the longest duration wins without "for"', () => {
  const reflux = extractConditions([paragraph(text('Added at '), qty(0, '°C'), text(', then the mixture was refluxed overnight ('), qty(16, 'h'), text(') under Ar, then cooled over '), qty(30, 'min'), text('.'))]);
  assert.equal(reflux.temperatureLabel, 'reflux');
  assert.equal(reflux.temperature, null, 'the addition temperature is not the reflux temperature');
  assert.deepEqual(extractConditions([paragraph(text('refluxed at '), qty(80, '°C'), text(' for '), qty(1, 'h'))]).temperature, { value: 80, unit: '°C' });
  assert.deepEqual(reflux.time, { value: 16, unit: 'h' });
  assert.equal(reflux.atmosphere, 'Ar');
  assert.deepEqual(reflux.notes, ['overnight']);
  assert.equal(describeConditions(reflux), 'reflux, 16 h, under Ar, overnight');

  const rt = extractConditions([paragraph(text('Stirred at rt for '), qty(2, 'h'), text(' at '), qty(5, 'bar'), text(' H2 in a sealed tube.'))]);
  assert.equal(rt.temperatureLabel, 'rt');
  assert.deepEqual(rt.pressure, { value: 5, unit: 'bar' });
  assert.deepEqual(rt.notes, ['sealed tube']);
  assert.equal(describeConditions(rt), 'rt, 2 h, 5 bar, sealed tube');
});

test('a section without conditions is empty, and merging only fills blanks', () => {
  const empty = extractConditions([paragraph(text('Add '), qty(2, 'g'), text(' of '), entity('x', 'X'), text('.'))]);
  assert.equal(describeConditions(empty), '');

  const fromText = extractConditions([paragraph(text('heated to '), qty(60, '°C'), text(' for '), qty(1, 'h'), text(' under N2.'))]);
  const merged = mergeConditions({ ...empty, temperature: { value: 25, unit: '°C' }, notes: ['dark'] }, fromText);
  assert.deepEqual(merged.temperature, { value: 25, unit: '°C' }, 'existing value kept');
  assert.deepEqual(merged.time, { value: 1, unit: 'h' }, 'blank filled');
  assert.equal(merged.atmosphere, 'N2');
  assert.deepEqual(merged.notes, ['dark']);
  assert.deepEqual(mergeConditions(null, fromText), fromText);
});
