import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeEntry, extractAnalytics } from './analytics.ts';

test('analytics blocks are read with their batch, entries normalised', () => {
  const content = {
    type: 'doc',
    content: [
      { type: 'paragraph' },
      {
        type: 'analytics',
        attrs: {
          batchId: 'b1',
          entries: [
            { id: 'a', technique: 'TLC', result: 'single spot', eluent: '3:1 hexanes/EtOAc', rf: 0.6, attachmentIds: ['att1'] },
            { id: 'b', technique: 'made up', result: 7, rf: 'x' }
          ]
        }
      },
      { type: 'blockquote', content: [{ type: 'analytics', attrs: { batchId: '', entries: [] } }] }
    ]
  };
  const blocks = extractAnalytics(content);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].batchId, 'b1');
  assert.deepEqual(blocks[0].entries[0], { id: 'a', technique: 'TLC', result: 'single spot', eluent: '3:1 hexanes/EtOAc', rf: 0.6, attachmentIds: ['att1'] });
  assert.deepEqual(blocks[0].entries[1], { id: 'b', technique: 'other', result: '', eluent: undefined, rf: null, attachmentIds: [] });
  assert.equal(blocks[1].batchId, null);
  assert.deepEqual(extractAnalytics(null), []);
});

test('entries describe themselves like an experimental section', () => {
  assert.equal(describeEntry({ id: 'a', technique: 'TLC', result: 'single spot', eluent: '3:1 hexanes/EtOAc', rf: 0.6, attachmentIds: [] }), 'TLC Rf 0.6 (3:1 hexanes/EtOAc): single spot');
  assert.equal(describeEntry({ id: 'a', technique: '1H NMR', result: 'δ 8.05 (d, 2H)', attachmentIds: [] }), '1H NMR: δ 8.05 (d, 2H)');
  assert.equal(describeEntry({ id: 'a', technique: 'mp', result: '', attachmentIds: [] }), 'mp');
});
