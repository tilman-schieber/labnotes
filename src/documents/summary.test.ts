import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeDocument } from './summary.ts';

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Exp' }] },
    { type: 'paragraph' },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Add ' },
        { type: 'quantity', attrs: { value: 25, unit: 'mg' } },
        { type: 'text', text: ' of ' },
        { type: 'entityMention', attrs: { id: 'e1', label: 'Compound X', entityType: 'compound' } },
        { type: 'text', text: '.' }
      ]
    },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'entityMention', attrs: { id: 'e2', label: 'Buffer', entityType: 'reagent' } }] }] }] },
    { type: 'reaction', attrs: { components: [{ entityId: 'e1', label: 'Compound X' }, { entityId: 'e3', label: 'Product' }] } }
  ]
};

test('first non-empty line with tokens rendered as text', () => {
  const summary = summarizeDocument(doc);
  assert.equal(summary.firstLine, 'Add 25 mg of Compound X.');
});

test('entities are collected once, including reaction rows', () => {
  const summary = summarizeDocument(doc);
  assert.deepEqual(
    summary.entities.map((entity) => entity.id),
    ['e1', 'e2', 'e3']
  );
});

test('empty document', () => {
  assert.deepEqual(summarizeDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }), { firstLine: '', entities: [] });
});
