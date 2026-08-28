import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createComponent } from './reaction.ts';
import { componentsFromBlocks, mergeComponents, sectionBlocksBefore } from './reactionFromText.ts';

const text = (value: string) => ({ type: 'text', text: value });
const entity = (id: string, label: string, entityType = 'compound') => ({ type: 'entityMention', attrs: { id, label, entityType } });
const qty = (value: number, unit: string) => ({ type: 'quantity', attrs: { value, unit } });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const heading = (value: string) => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });

test('section is everything since the previous heading', () => {
  const blocks = [heading('A'), paragraph(text('a1')), heading('B'), paragraph(text('b1')), paragraph(text('b2'))];
  assert.deepEqual(sectionBlocksBefore(blocks, 5).map((b) => (b.content?.[0] as { text: string }).text), ['B', 'b1', 'b2']);
  assert.deepEqual(sectionBlocksBefore(blocks, 1).map((b) => (b.content?.[0] as { text: string }).text), ['A']);
});

test('prose becomes rows with roles and amounts', () => {
  const blocks = [
    paragraph(entity('sa', 'Salicylic acid'), text(' ('), qty(2, 'g'), text(') was dissolved in '), entity('aa', 'Acetic anhydride'), text(' ('), qty(5, 'mL'), text(') with '), qty(0.05, 'eq'), text(' of '), entity('h', 'H2SO4'), text('.')),
    paragraph(text('Work-up afforded '), entity('p', 'Aspirin'), text(' ('), qty(1.8, 'g'), text(').')),
    paragraph(text('See '), entity('document-x', 'Other experiment', 'document'), text('.'))
  ];
  const rows = componentsFromBlocks(blocks);
  assert.deepEqual(
    rows.map((r) => [r.role, r.label, r.mass?.value ?? null, r.volume?.value ?? null, r.equivalents, r.actualMass?.value ?? null]),
    [
      ['reactant', 'Salicylic acid', 2, null, null, null],
      ['solvent', 'Acetic anhydride', null, 5, null, null],
      ['reagent', 'H2SO4', null, null, 0.05, null],
      ['product', 'Aspirin', null, null, 1, 1.8]
    ]
  );
});

test('merge keeps manual rows, fills blanks, adds new entities, drops empty placeholders', () => {
  const manual = createComponent('reactant', { id: 'm', entityId: 'sa', label: 'Salicylic acid', molecularWeight: 138.12, mass: { value: 3, unit: 'g' } });
  const blank = createComponent('reactant');
  const fromText = componentsFromBlocks([paragraph(entity('sa', 'Salicylic acid'), text(' ('), qty(2, 'g'), text(', '), qty(10, 'mL'), text(') and '), entity('b', 'B'), text(' ('), qty(1, 'g'), text(').'))]);

  const merged = mergeComponents([manual, blank], fromText);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].mass?.value, 3, 'manual mass kept');
  assert.equal(merged[0].volume?.value, 10, 'blank volume filled from text');
  assert.equal(merged[0].molecularWeight, 138.12);
  assert.equal(merged[1].label, 'B');
});
