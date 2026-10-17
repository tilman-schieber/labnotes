import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractText } from './text.mjs';

test('flattens text, mentions, quantities, math and reaction rows', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Aspirin' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Add ' },
          { type: 'quantity', attrs: { value: 2, unit: 'g' } },
          { type: 'text', text: ' of ' },
          { type: 'entityMention', attrs: { id: 'x', label: 'Salicylic acid' } },
          { type: 'text', text: ' with ' },
          { type: 'userMention', attrs: { id: 'u', label: 'Researcher' } },
          { type: 'inlineMath', attrs: { latex: '\\ce{H2SO4}' } }
        ]
      },
      { type: 'reaction', attrs: { title: 'Step 1', components: [{ label: 'Acetic anhydride' }, { label: '' }] } }
    ]
  };

  assert.equal(extractText(doc), 'Aspirin\nAdd 2 g of Salicylic acid with Researcher \\ce{H2SO4}\nStep 1 Acetic anhydride');
});

test('handles empty and malformed input', () => {
  assert.equal(extractText(null), '');
  assert.equal(extractText({ type: 'doc' }), '');
  assert.equal(extractText({ type: 'doc', content: [{ type: 'paragraph' }] }), '');
});

test('plates contribute their title, format, measure and group names', () => {
  const doc = { type: 'doc', content: [{ type: 'plate', attrs: { title: 'MIC', format: 96, measure: 'OD600', groups: [{ label: 'BL21' }, { label: '' }], wells: {} } }] };
  assert.equal(extractText(doc).trim(), 'MIC 96-well plate OD600 BL21');
});
