import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTransfers } from './transfers.ts';

const text = (value: string) => ({ type: 'text', text: value });
const entity = (id: string, label: string, entityType = 'sample') => ({ type: 'entityMention', attrs: { id, label, entityType, refType: 'entity' } });
const quantity = (value: number, unit: string) => ({ type: 'quantity', attrs: { value, unit } });
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

test('"stored #A in #B" places A in B', () => {
  const transfers = extractTransfers(
    doc(
      paragraph(text('Stored '), entity('b7', 'Batch 7', 'batch'), text(' in '), entity('f2', 'Freezer 2', 'container'), text(', box 3.')),
      paragraph(text('The rest of '), entity('ly', 'Lysate'), text(' was put back into '), entity('f2', 'Freezer 2', 'container'), text('.')),
      paragraph(text('Kept '), quantity(5, 'mL'), text(' of '), entity('m', 'Medium', 'reagent'), text(' at '), entity('rt', 'Bench', 'location'), text(' overnight.')),
      paragraph(text('Stored '), entity('t1', 'Tube 1', 'container'), text(' and '), entity('t2', 'Tube 2', 'container'), text(' in '), entity('bx', 'Box 3', 'container'), text('.'))
    )
  );
  assert.deepEqual(
    transfers.map((transfer) => [transfer.kind, transfer.subjectLabel, transfer.objectLabel]),
    [
      ['stored_in', 'Batch 7', 'Freezer 2'],
      ['stored_in', 'Lysate', 'Freezer 2'],
      ['stored_in', 'Medium', 'Bench'],
      ['stored_in', 'Tube 1', 'Box 3'],
      ['stored_in', 'Tube 2', 'Box 3']
    ]
  );
});

test('"took 2 mL of #A into #B and #C" derives B and C from A, with the amount', () => {
  const transfers = extractTransfers(
    doc(
      paragraph(text('Took '), quantity(2, 'mL'), text(' of '), entity('sa', 'Stock A', 'reagent'), text(' into '), entity('t14', 'Tube 14', 'container'), text(' and '), entity('t15', 'Tube 15', 'container'), text('.')),
      paragraph(text('Aliquoted the '), entity('ly', 'Lysate'), text(' culture into '), entity('c1', 'Cryotube 1', 'container'), text(' with 15 % glycerol.')),
      paragraph(text('Inoculated '), quantity(5, 'mL'), text(' of '), entity('lb', 'LB medium', 'reagent'), text(' from '), entity('col', 'Colony 3'), text(' into '), entity('f1', 'Flask 1', 'container'), text('.'))
    )
  );
  assert.deepEqual(
    transfers.map((transfer) => [transfer.kind, transfer.subjectLabel, transfer.objectLabel, transfer.quantity]),
    [
      ['derived_from', 'Tube 14', 'Stock A', { value: 2, unit: 'mL' }],
      ['derived_from', 'Tube 15', 'Stock A', { value: 2, unit: 'mL' }],
      ['derived_from', 'Cryotube 1', 'Lysate', null],
      ['derived_from', 'Flask 1', 'Colony 3', { value: 5, unit: 'mL' }]
    ]
  );
});

test('ordinary usage sentences produce nothing', () => {
  const transfers = extractTransfers(
    doc(
      paragraph(text('Add '), quantity(25, 'mg'), text(' of '), entity('x', 'Compound X', 'compound'), text(' to '), quantity(2, 'mL'), text(' of '), entity('b', 'Buffer', 'reagent'), text('.')),
      paragraph(text('Mixed '), entity('x', 'Compound X', 'compound'), text(' with '), entity('b', 'Buffer', 'reagent'), text(' and stirred.')),
      paragraph(text('Stored at '), quantity(-20, '°C'), text('.'))
    )
  );
  assert.deepEqual(transfers, []);
});
