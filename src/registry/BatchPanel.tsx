import { useEffect, useState } from 'react';
import { attachmentUrl, fetchEntityAttachments, type BackendAttachment, type BackendEntityDetail } from '../api/backend';
import { describeEntry, type AnalyticsEntry } from '../chemistry/analytics';
import { isCompoundAttributes, smilesToSvg, type CompoundAttributes } from '../chemistry/molecule';
import { formatExperimentNumber } from '../chemistry/batchCode';
import { formatQuantity } from '../units/quantity';
import { stockState } from './stock';

type Props = {
  detail: BackendEntityDetail;
  onOpenDocument: (documentId: string) => void;
  onOpenEntity: (entityId: string) => void;
};

type Mirror = { documentId: string; entries: AnalyticsEntry[] };

// A batch: which compound, how much is left, where it was made, and the analytics and files that
// describe it. The data themselves are edited in the experiment; this is the read-only view.
export default function BatchPanel({ detail, onOpenDocument, onOpenEntity }: Props) {
  const { entity, parent, madeIn } = detail;
  const attributes = entity.attributes ?? {};
  const [svg, setSvg] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<BackendAttachment[]>([]);

  const parentAttributes = parent && isCompoundAttributes(parent.attributes) ? (parent.attributes as CompoundAttributes) : null;

  useEffect(() => {
    let cancelled = false;
    if (!parentAttributes?.smiles) {
      setSvg(null);
      return;
    }
    smilesToSvg(parentAttributes.smiles, 280, 180)
      .then((image) => {
        if (!cancelled) {
          setSvg(image);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [parentAttributes?.smiles]);

  useEffect(() => {
    let cancelled = false;
    fetchEntityAttachments(entity.id)
      .then((items) => {
        if (!cancelled) {
          setAttachments(items);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entity.id]);

  const stock = stockState(attributes, detail.usageTotals);
  const mirrors = (Array.isArray(attributes.analytics) ? attributes.analytics : []) as Mirror[];
  const precursors = detail.relations.filter((relation) => relation.predicate === 'derived_from' && relation.subjectEntityId === entity.id);

  return (
    <section className="entity-section compound-panel batch-panel">
      <h3>Batch</h3>
      <div className="compound-layout">
        <div className="compound-structure">
          {svg ? <div className="compound-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="compound-svg compound-svg-empty">No structure on the compound</div>}
        </div>
        <dl className="compound-properties">
          <dt>Code</dt>
          <dd>{String(attributes.batchCode ?? entity.label)}</dd>
          {parent && (
            <>
              <dt>Batch of</dt>
              <dd>
                <button type="button" className="link-button" onClick={() => onOpenEntity(parent.id)}>
                  {parent.label}
                </button>
                {parentAttributes?.formula && <span className="entity-muted"> · {parentAttributes.formula}</span>}
              </dd>
            </>
          )}
          {madeIn && (
            <>
              <dt>Made in</dt>
              <dd>
                <button type="button" className="link-button" onClick={() => onOpenDocument(madeIn.id)}>
                  {madeIn.number ? `Exp ${formatExperimentNumber(madeIn.number)} · ` : ''}
                  {madeIn.title}
                </button>
              </dd>
            </>
          )}
          {stock && (
            <>
              <dt>Stock</dt>
              <dd className={`stock-${stock.level}`}>
                {formatQuantity(stock.remaining)} left of {formatQuantity(stock.initial)}
                {stock.level === 'depleted' ? ' — used up' : stock.level === 'low' ? ' — running low' : ''}
              </dd>
            </>
          )}
          {attributes.appearance ? (
            <>
              <dt>Appearance</dt>
              <dd>{String(attributes.appearance)}</dd>
            </>
          ) : null}
          {typeof attributes.purity === 'number' && (
            <>
              <dt>Purity</dt>
              <dd>
                {attributes.purity} %{attributes.purityMethod ? ` (${String(attributes.purityMethod)})` : ''}
              </dd>
            </>
          )}
          {precursors.length > 0 && (
            <>
              <dt>Made from</dt>
              <dd>
                {precursors.map((relation) => (
                  <button key={relation.id} type="button" className="link-button" onClick={() => onOpenEntity(relation.objectEntityId)} style={{ marginRight: 6 }}>
                    {relation.objectLabel}
                  </button>
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>

      <h4 className="panel-title">Analytics</h4>
      {mirrors.length === 0 && <div className="entity-muted">None recorded. Add an analytics block below the reaction table in the experiment.</div>}
      {mirrors.map((mirror) => (
        <ul key={mirror.documentId} className="batch-analytics">
          {mirror.entries.map((entry) => (
            <li key={entry.id}>
              {describeEntry(entry)}
              {entry.attachmentIds.length > 0 && (
                <span className="entity-muted">
                  {' '}
                  ·{' '}
                  {entry.attachmentIds.map((id) => (
                    <a key={id} href={attachmentUrl(id)} target="_blank" rel="noopener" style={{ marginRight: 4 }}>
                      {attachments.find((attachment) => attachment.id === id)?.filename ?? 'file'}
                    </a>
                  ))}
                </span>
              )}
            </li>
          ))}
          {madeIn?.id === mirror.documentId ? null : (
            <li className="entity-muted">
              from{' '}
              <button type="button" className="link-button" onClick={() => onOpenDocument(mirror.documentId)}>
                another experiment
              </button>
            </li>
          )}
        </ul>
      ))}

      {attachments.length > 0 && (
        <>
          <h4 className="panel-title">Files</h4>
          <ul className="batch-files">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a href={attachmentUrl(attachment.id)} target="_blank" rel="noopener">
                  {attachment.filename}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
