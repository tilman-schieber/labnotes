// A batch is a particular lot of a compound: the material isolated in one experiment (TS-012-A),
// or a bottle that was bought. It is an entity of type `batch`, linked to its compound with a
// `belongs_to` relation and to the batches it was made from with `derived_from`, and it carries
// its own amount, appearance, purity and the analytics mirrored from the experiment.
import { batchCode, nextBatchLetter } from '../../src/chemistry/batchCode.ts';
import { experimentNumberOf } from './numbering.mjs';

// What to store for a new batch. Pure: everything it needs is passed in.
export function planBatch({ compound, document, user, existingCodes = [], input = {} }) {
  const number = experimentNumberOf(document);
  if (!compound?.id) {
    throw new Error('A batch needs a compound');
  }
  if (number === null) {
    throw new Error('The experiment has no number yet');
  }

  const initials = user?.initials ?? '';
  const code = batchCode(initials, number, nextBatchLetter(existingCodes));

  const attributes = {
    batchCode: code,
    madeInDocumentId: document.id,
    madeBy: user?.id ?? undefined,
    amount: typeof input.amount === 'string' && input.amount.trim() ? input.amount.trim() : undefined,
    appearance: typeof input.appearance === 'string' && input.appearance.trim() ? input.appearance.trim() : undefined,
    purity: typeof input.purity === 'number' && Number.isFinite(input.purity) ? input.purity : undefined,
    purityMethod: typeof input.purityMethod === 'string' && input.purityMethod.trim() ? input.purityMethod.trim() : undefined
  };
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === undefined) {
      delete attributes[key];
    }
  }

  return {
    label: code,
    type: 'batch',
    status: 'verified',
    attributes,
    relations: [
      { predicate: 'belongs_to', objectEntityId: compound.id, sourceDocumentId: document.id },
      ...(Array.isArray(input.reactantBatchIds) ? input.reactantBatchIds : [])
        .filter((id) => typeof id === 'string' && id)
        .map((id) => ({ predicate: 'derived_from', objectEntityId: id, sourceDocumentId: document.id }))
    ]
  };
}
