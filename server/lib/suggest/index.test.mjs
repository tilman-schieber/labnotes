import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContext, listProviders, registerProvider, suggestFor, unregisterProvider } from './index.mjs';

const document = {
  id: 'experiment-1',
  title: 'Test',
  kind: 'experiment',
  metadata: { number: 3 },
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Add ' }, { type: 'quantity', attrs: { value: 1, unit: 'g' } }, { type: 'text', text: ' of ' }, { type: 'entityMention', attrs: { id: 'c', label: 'C', entityType: 'compound' } }] },
      { type: 'reaction', attrs: { title: '', components: [{ id: 'r', role: 'reactant', entityId: 'c', label: 'C', molecularWeight: 100, mass: { value: 1, unit: 'g' }, equivalents: null, volume: null, density: null, concentration: null, limiting: false, actualMass: null }] } }
    ]
  }
};

test('the context carries the document, its usages, and each reaction with computed stoichiometry', () => {
  const context = buildContext(document, new Map([['c', { label: 'C' }]]));
  assert.equal(context.document.id, 'experiment-1');
  assert.equal(context.usages.length, 1);
  assert.equal(context.reactions.length, 1);
  assert.equal(context.reactions[0].blockIndex, 1);
  assert.equal(context.reactions[0].summary.components[0].amountMmol, 10);
  assert.equal(context.entities.get('c').label, 'C');
});

test('providers run in order, results are normalised, a failing provider does not break the rest', async () => {
  registerProvider({ name: 'first', suggest: async (context) => [{ kind: 'role', message: `${context.reactions.length} reaction(s)`, target: { documentId: context.document.id, blockIndex: 1, componentId: 'r' }, patch: { role: 'reagent' } }, { kind: 'made-up', message: 'odd kind' }, { nope: true }] });
  registerProvider({ name: 'broken', suggest: async () => { throw new Error('offline'); } });
  try {
    assert.deepEqual(listProviders(), ['first', 'broken']);
    const suggestions = await suggestFor(buildContext(document));
    assert.deepEqual(suggestions, [
      { kind: 'role', message: '1 reaction(s)', target: { documentId: 'experiment-1', blockIndex: 1, componentId: 'r' }, patch: { role: 'reagent' }, provider: 'first' },
      { kind: 'text', message: 'odd kind', target: null, patch: null, provider: 'first' },
      { kind: 'text', message: 'broken: offline', target: null, patch: null, provider: 'broken' }
    ]);
  } finally {
    unregisterProvider('first');
    unregisterProvider('broken');
  }
});

test('the no-op provider suggests nothing', async () => {
  const noop = (await import('./noop.mjs')).default;
  assert.equal(noop.name, 'none');
  assert.deepEqual(await noop.suggest(buildContext(document)), []);
});
