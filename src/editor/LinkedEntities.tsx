import { useEffect, useState } from 'react';
import { fetchDocumentMentions, type BackendDocumentMention } from '../api/backend';
import { formatQuantity } from '../units/quantity';
import { IconAtom } from '../ui/icons';

type Props = {
  documentId: string;
  // Bumped after a save so the list follows the mention index.
  refreshToken: number;
  onOpenEntity: (entityId: string) => void;
  onOpenDocument: (documentId: string) => void;
};

// What this document references, grouped by type, straight from the server-side mention index.
export default function LinkedEntities({ documentId, refreshToken, onOpenEntity, onOpenDocument }: Props) {
  const [mentions, setMentions] = useState<BackendDocumentMention[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDocumentMentions(documentId)
      .then((items) => {
        if (!cancelled) {
          setMentions(items);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId, refreshToken]);

  const entities = mentions.filter((mention) => mention.refType === 'entity' && mention.currentLabel);
  const groups = new Map<string, BackendDocumentMention[]>();
  entities.forEach((mention) => {
    const type = mention.entityType ?? 'entity';
    groups.set(type, [...(groups.get(type) ?? []), mention]);
  });

  return (
    <div className="panel">
      <span className="panel-title">
        <IconAtom size={14} />
        Linked entities{entities.length > 0 ? ` · ${entities.length}` : ''}
      </span>
      {entities.length === 0 ? (
        <div className="linked-empty" style={{ marginTop: '0.4rem' }}>
          Reference samples, reagents, compounds and documents with <code>#</code>, people with <code>@</code>.
        </div>
      ) : (
        <div className="linked-entities" style={{ marginTop: '0.5rem' }}>
          {[...groups.entries()].map(([type, items]) => (
            <span key={type} className="linked-entities-group">
              <span className="linked-entities-type">{type}</span>
              {items.map((mention) => (
                <button
                  key={mention.id}
                  type="button"
                  className={`linked-entity linked-entity-${type}`}
                  onClick={() => (mention.entityDocumentId ? onOpenDocument(mention.entityDocumentId) : onOpenEntity(mention.targetId))}
                  title={mention.entityDocumentId ? 'Open document' : 'Open in registry'}
                >
                  {mention.currentLabel}
                  {mention.quantities.length > 0 && (
                    <span className="linked-entity-amount">{mention.quantities.map(formatQuantity).join(', ')}</span>
                  )}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
