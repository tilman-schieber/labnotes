import { useEffect, useState } from 'react';
import { fetchBatches, type BackendBatch } from '../api/backend';
import { formatExperimentNumber } from '../chemistry/batchCode';
import { formatQuantity } from '../units/quantity';
import { stockState } from './stock';

type Props = {
  compoundId: string;
  onOpenEntity: (entityId: string) => void;
  onOpenDocument: (documentId: string) => void;
};

// The lots of a compound: what is on the shelf, and which experiment made each.
export default function BatchList({ compoundId, onOpenEntity, onOpenDocument }: Props) {
  const [batches, setBatches] = useState<BackendBatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBatches(compoundId)
      .then((items) => {
        if (!cancelled) {
          setBatches(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBatches([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [compoundId]);

  if (!batches || batches.length === 0) {
    return null;
  }

  return (
    <section className="entity-section">
      <h3>Batches</h3>
      <ul className="batch-list">
        {batches.map((batch) => {
          const stock = stockState(batch.attributes, batch.usageTotals);
          return (
            <li key={batch.id}>
              <button type="button" className="linked-entity linked-entity-batch" onClick={() => onOpenEntity(batch.id)}>
                {batch.label}
              </button>
              {stock && (
                <span className={`entity-muted stock-${stock.level}`}>
                  {' '}
                  {formatQuantity(stock.remaining)} left of {formatQuantity(stock.initial)}
                </span>
              )}
              {batch.attributes.appearance ? <span className="entity-muted"> · {String(batch.attributes.appearance)}</span> : null}
              {batch.madeInDocumentId && (
                <span className="entity-muted">
                  {' '}
                  ·{' '}
                  <button type="button" className="link-button" onClick={() => onOpenDocument(batch.madeInDocumentId as string)}>
                    {batch.madeInNumber ? `Exp ${formatExperimentNumber(batch.madeInNumber)}` : batch.madeInTitle}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
