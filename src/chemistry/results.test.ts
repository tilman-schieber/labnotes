import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractResults, parseResultsGrid } from './results.ts';

const text = (value: string) => ({ type: 'text', text: value });
const entity = (id: string, label: string, entityType = 'sample') => ({ type: 'entityMention', attrs: { id, label, entityType, refType: 'entity' } });
const quantity = (value: number, unit: string) => ({ type: 'quantity', attrs: { value, unit } });
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

test('"measure of #entity was value" in prose', () => {
  const results = extractResults(doc(paragraph(text('After 6 h the OD600 of '), entity('c1', 'Culture A'), text(' was 1.21 and the pH of '), entity('c1', 'Culture A'), text(' was 6.8.'))));
  assert.deepEqual(
    results.map((result) => [result.label, result.measure, result.value, result.unit, result.source]),
    [
      ['Culture A', 'OD600', 1.21, '', 'prose'],
      ['Culture A', 'pH', 6.8, '', 'prose']
    ]
  );
  assert.equal(results[0].sentence, 'After 6 h the OD600 of Culture A was 1.21 and the pH of Culture A was 6.8.');
});

test('units inline or as a quantity token, and "#entity: measure value"', () => {
  const results = extractResults(
    doc(
      paragraph(text('The Tm of '), entity('p1', 'Primer F1', 'reagent'), text(' is 61.3 °C.')),
      paragraph(text('Melting point of '), entity('b1', 'Batch 7', 'batch'), text(' was '), quantity(121, '°C'), text('.')),
      paragraph(entity('b1', 'Batch 7', 'batch'), text(': purity 98.5 %, yield = 85 %.')),
      paragraph(entity('b1', 'Batch 7', 'batch'), text(' has a viability of 92 % after thawing.'))
    )
  );
  assert.deepEqual(
    results.map((result) => [result.label, result.measure, result.value, result.unit]),
    [
      ['Primer F1', 'Tm', 61.3, '°C'],
      ['Batch 7', 'Melting point', 121, '°C'],
      ['Batch 7', 'purity', 98.5, '%'],
      ['Batch 7', 'viability', 92, '%']
    ]
  );
});

test('amounts used are not results', () => {
  const results = extractResults(
    doc(
      paragraph(text('Add '), quantity(25, 'mg'), text(' of '), entity('x', 'Compound X', 'compound'), text(' to '), quantity(2, 'mL'), text(' of '), entity('b', 'Buffer', 'reagent'), text('.')),
      paragraph(text('A solution of '), entity('x', 'Compound X', 'compound'), text(' in THF was stirred for 2 h.')),
      paragraph(text('3 mL of '), entity('b', 'Buffer', 'reagent'), text(' was 2 °C.'))
    )
  );
  assert.deepEqual(results, []);
});

test('results blocks and plates with a measure contribute values', () => {
  const results = extractResults(
    doc(
      {
        type: 'results',
        attrs: {
          title: 'Day 3',
          columns: [
            { id: 'c1', label: 'OD600', unit: '' },
            { id: 'c2', label: 'Viability', unit: '%' }
          ],
          rows: [
            { id: 'r1', entityId: 'cul', entityType: 'sample', label: 'Culture A', values: { c1: 1.3, c2: 95 }, note: 'rep 1' },
            { id: 'r2', entityId: null, entityType: null, label: 'blank', values: { c1: 0.04, c2: null }, note: '' }
          ]
        }
      },
      {
        type: 'plate',
        attrs: {
          title: 'MIC',
          format: 6,
          measure: 'OD600',
          groups: [{ id: 'g1', label: 'BL21', color: '#60a5fa', entityId: 'strain', entityType: 'sample' }],
          wells: { A1: { group: 'g1', note: '', value: 1 }, A2: { group: 'g1', note: '', value: 1.2 } }
        }
      }
    )
  );
  assert.deepEqual(
    results.map((result) => [result.label, result.measure, result.value, result.unit, result.source, result.sentence]),
    [
      ['Culture A', 'OD600', 1.3, '', 'block', 'Day 3 · rep 1'],
      ['Culture A', 'Viability', 95, '%', 'block', 'Day 3 · rep 1'],
      ['BL21', 'OD600', 1.1, '', 'plate', 'MIC: mean of 2 wells (sd 0.141)']
    ]
  );
});

test('parseResultsGrid reads a header with units and sample rows', () => {
  const grid = parseResultsGrid('Sample\tOD600\tViability (%)\nCulture A\t1.21\t95\nCulture B\t0,98\t\nblank\t0.04\t0');
  assert.deepEqual(grid.columns, [
    { label: 'OD600', unit: '' },
    { label: 'Viability', unit: '%' }
  ]);
  assert.deepEqual(grid.rows, [
    { label: 'Culture A', values: [1.21, 95] },
    { label: 'Culture B', values: [0.98, null] },
    { label: 'blank', values: [0.04, 0] }
  ]);
});
