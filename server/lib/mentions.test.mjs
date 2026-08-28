import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMentions, retargetEntityMentions } from './mentions.mjs';

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

test('retargets matching entity mentions and leaves everything else untouched', () => {
  const doc = {
    type: 'doc',
    content: [paragraph(entity('old', 'Old'), user('old', 'User'), { type: 'text', text: 'x' }), paragraph(entity('other', 'Other'))]
  };

  const { content, changed } = retargetEntityMentions(doc, 'old', 'new', 'New');

  assert.equal(changed, true);
  assert.deepEqual(content.content[0].content[0].attrs, { id: 'new', label: 'New', refType: 'entity', entityType: 'sample' });
  assert.deepEqual(content.content[0].content[1], user('old', 'User'));
  assert.deepEqual(content.content[1], paragraph(entity('other', 'Other')));
  assert.deepEqual(doc.content[0].content[0].attrs.id, 'old', 'input is not mutated');
});

test('retarget reports no change when nothing matches', () => {
  const doc = { type: 'doc', content: [paragraph(entity('a', 'A'))] };
  const result = retargetEntityMentions(doc, 'zzz', 'new', 'New');

  assert.equal(result.changed, false);
  assert.equal(result.content, doc, 'same object returned when unchanged');
});

test('reaction block components count as entity references and are retargeted on merge', () => {
  const reaction = {
    type: 'reaction',
    attrs: {
      title: 'Step 1',
      components: [
        { id: 'c1', role: 'reactant', entityId: 'cmp-a', label: 'A' },
        { id: 'c2', role: 'reagent', entityId: null, label: 'free text' },
        { id: 'c3', role: 'product', entityId: 'cmp-b', label: 'B' }
      ]
    }
  };
  const doc = { type: 'doc', content: [paragraph(entity('cmp-a', 'A')), reaction] };

  assert.deepEqual(extractMentions(doc), [
    { refType: 'entity', targetId: 'cmp-a', label: 'A' },
    { refType: 'entity', targetId: 'cmp-b', label: 'B' }
  ]);

  const { content, changed } = retargetEntityMentions(doc, 'cmp-b', 'cmp-c', 'C');
  assert.equal(changed, true);
  assert.deepEqual(content.content[1].attrs.components[2], { id: 'c3', role: 'product', entityId: 'cmp-c', label: 'C' });
  assert.equal(content.content[1].attrs.components[0], reaction.attrs.components[0], 'untouched rows keep identity');
});

test('tolerates a missing label', () => {
  const doc = { type: 'doc', content: [paragraph({ type: 'userMention', attrs: { id: 'user-1' } })] };

  assert.deepEqual(extractMentions(doc), [{ refType: 'user', targetId: 'user-1', label: null }]);
});
