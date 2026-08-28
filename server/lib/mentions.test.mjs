import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMentions } from './mentions.mjs';

const entity = (id, label) => ({ type: 'entityMention', attrs: { id, label, refType: 'entity', entityType: 'sample' } });
const user = (id, label) => ({ type: 'userMention', attrs: { id, label, refType: 'user' } });
const paragraph = (...content) => ({ type: 'paragraph', content });

test('extracts entity and user mentions from nested content', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      paragraph({ type: 'text', text: 'Used ' }, entity('entity-1', 'Sample A'), { type: 'text', text: ' with ' }, user('user-1', 'Researcher')),
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(entity('entity-2', 'Lysis Buffer'))] }] }]
      }
    ]
  };

  assert.deepEqual(extractMentions(doc), [
    { refType: 'entity', targetId: 'entity-1', label: 'Sample A' },
    { refType: 'user', targetId: 'user-1', label: 'Researcher' },
    { refType: 'entity', targetId: 'entity-2', label: 'Lysis Buffer' }
  ]);
});

test('dedupes repeated references to the same target', () => {
  const doc = { type: 'doc', content: [paragraph(entity('entity-1', 'Sample A')), paragraph(entity('entity-1', 'Sample A'))] };

  assert.deepEqual(extractMentions(doc), [{ refType: 'entity', targetId: 'entity-1', label: 'Sample A' }]);
});

test('keeps the same id separate across ref types', () => {
  const doc = { type: 'doc', content: [paragraph(entity('shared', 'Entity'), user('shared', 'User'))] };

  assert.equal(extractMentions(doc).length, 2);
});

test('ignores mention nodes without an id and non-document input', () => {
  const doc = { type: 'doc', content: [paragraph({ type: 'entityMention', attrs: { id: null, label: 'Broken' } })] };

  assert.deepEqual(extractMentions(doc), []);
  assert.deepEqual(extractMentions(null), []);
  assert.deepEqual(extractMentions('not a doc'), []);
});

test('tolerates a missing label', () => {
  const doc = { type: 'doc', content: [paragraph({ type: 'userMention', attrs: { id: 'user-1' } })] };

  assert.deepEqual(extractMentions(doc), [{ refType: 'user', targetId: 'user-1', label: null }]);
});
