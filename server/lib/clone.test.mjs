import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloneContent, withTitle } from './clone.mjs';

test('a clone keeps prose, amounts and rows but drops what belonged to the original run', () => {
  const content = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Run 1' }] },
      { type: 'paragraph', content: [{ type: 'timestamp', attrs: { at: '2026-01-01T10:00:00Z' } }, { type: 'text', text: ' Add ' }, { type: 'quantity', attrs: { value: 2, unit: 'g' } }] },
      { type: 'paragraph', content: [{ type: 'timestamp', attrs: { at: '2026-01-01T10:00:00Z' } }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] }] },
      { type: 'reaction', attrs: { title: '', components: [{ id: 'a', role: 'product', actualMass: { value: 1, unit: 'g' }, batchId: 'b1', mass: null }], conditions: { time: { value: 1, unit: 'h' } } } },
      { type: 'analytics', attrs: { batchId: 'b1', entries: [] } }
    ]
  };
  const clone = cloneContent(content);
  assert.equal(clone.content.length, 5, 'analytics block dropped');
  assert.deepEqual(clone.content[1].content, [{ type: 'text', text: ' Add ' }, { type: 'quantity', attrs: { value: 2, unit: 'g' } }]);
  assert.equal(clone.content[2].content, undefined, 'a paragraph that only held a timestamp is emptied cleanly');
  assert.equal(clone.content[3].content[0].attrs.checked, false);
  assert.deepEqual(clone.content[4].attrs.components[0], { id: 'a', role: 'product', actualMass: null, batchId: null, mass: null });
  assert.deepEqual(clone.content[4].attrs.conditions, { time: { value: 1, unit: 'h' } }, 'conditions carry over');
  assert.deepEqual(content.content[4].attrs.components[0].actualMass, { value: 1, unit: 'g' }, 'the original is untouched');
});

test('retitling replaces the level-1 heading only', () => {
  const content = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Old' }] }, { type: 'paragraph' }] };
  assert.equal(withTitle(content, 'New').content[0].content[0].text, 'New');
  const noTitle = { type: 'doc', content: [{ type: 'paragraph' }] };
  assert.deepEqual(withTitle(noTitle, 'New'), noTitle);
});
