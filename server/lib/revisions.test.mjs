import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson, hashChainLink, hashRevisionContent } from './revisions.mjs';

test('canonical JSON is independent of key order and nesting', () => {
  const left = { type: 'doc', content: [{ attrs: { level: 1, id: 'a' }, type: 'heading' }] };
  const right = { content: [{ type: 'heading', attrs: { id: 'a', level: 1 } }], type: 'doc' };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(canonicalJson({ b: null, a: [1, 'x', true] }), '{"a":[1,"x",true],"b":null}');
});

test('content hash changes with any content change', () => {
  const base = hashRevisionContent('Title', { type: 'doc', content: [] });
  assert.equal(base, hashRevisionContent('Title', { type: 'doc', content: [] }));
  assert.notEqual(base, hashRevisionContent('Title!', { type: 'doc', content: [] }));
  assert.notEqual(base, hashRevisionContent('Title', { type: 'doc', content: [{ type: 'paragraph' }] }));
});

test('chain link depends on the previous link and the signature facts', () => {
  const link = { previousChainHash: null, contentHash: 'abc', signedBy: 'u1', signedAt: '2026-09-04T10:00:00.000Z', note: null };
  const first = hashChainLink(link);
  assert.equal(first, hashChainLink({ ...link, note: null }));
  assert.notEqual(first, hashChainLink({ ...link, previousChainHash: first }));
  assert.notEqual(first, hashChainLink({ ...link, note: 'reviewed' }));
  assert.notEqual(first, hashChainLink({ ...link, signedBy: 'u2' }));
});
