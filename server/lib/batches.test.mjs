import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planBatch } from './batches.mjs';

const compound = { id: 'entity-aspirin', label: 'Aspirin' };
const document = { id: 'experiment-12', metadata: { number: 12 } };
const user = { id: 'user-1', initials: 'TS' };

test('a batch is coded after its experiment and linked to compound and precursors', () => {
  const plan = planBatch({ compound, document, user, existingCodes: ['TS-012-A'], input: { amount: '1.15 g', appearance: 'white solid', purity: 97, reactantBatchIds: ['entity-batch-prev'] } });
  assert.equal(plan.label, 'TS-012-B');
  assert.equal(plan.type, 'batch');
  assert.deepEqual(plan.attributes, { batchCode: 'TS-012-B', madeInDocumentId: 'experiment-12', madeBy: 'user-1', amount: '1.15 g', appearance: 'white solid', purity: 97 });
  assert.deepEqual(plan.relations, [
    { predicate: 'belongs_to', objectEntityId: 'entity-aspirin', sourceDocumentId: 'experiment-12' },
    { predicate: 'derived_from', objectEntityId: 'entity-batch-prev', sourceDocumentId: 'experiment-12' }
  ]);
});

test('blank fields are left out, and initials are optional', () => {
  const plan = planBatch({ compound, document, user: null, input: { amount: '  ', purity: 'x' } });
  assert.equal(plan.label, '012-A');
  assert.deepEqual(plan.attributes, { batchCode: '012-A', madeInDocumentId: 'experiment-12' });
  assert.equal(plan.relations.length, 1);
});

test('an unnumbered experiment cannot register a batch', () => {
  assert.throws(() => planBatch({ compound, document: { id: 'x', metadata: {} }, user }), /no number/);
});
