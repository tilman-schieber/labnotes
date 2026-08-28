import { useEffect, useState } from 'react';
import { fetchDocumentRevisions, restoreDocumentRevision, type BackendRevisionSummary } from '../api/backend';

type Props = {
  documentId: string | null;
  onRestored: () => void;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function RevisionHistory({ documentId, onRestored }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [revisions, setRevisions] = useState<BackendRevisionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyRevision, setBusyRevision] = useState<number | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [documentId]);

  useEffect(() => {
    if (!isOpen || !documentId) {
      return;
    }

    let cancelled = false;
    fetchDocumentRevisions(documentId)
      .then((items) => {
        if (!cancelled) {
          setRevisions(items);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load history');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, documentId]);

  const handleRestore = async (revision: number) => {
    if (!documentId || !window.confirm(`Restore revision ${revision}? The current content is kept in history.`)) {
      return;
    }

    setBusyRevision(revision);
    try {
      await restoreDocumentRevision(documentId, revision);
      setIsOpen(false);
      onRestored();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Failed to restore revision');
    } finally {
      setBusyRevision(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`editor-action-button${isOpen ? ' is-active' : ''}`}
        onClick={() => setIsOpen((previous) => !previous)}
        disabled={!documentId}
      >
        History
      </button>

      {isOpen && (
        <div className="revision-panel" role="dialog" aria-label="Revision history">
          {error && <div className="revision-error">{error}</div>}
          {!error && revisions.length === 0 && <div className="revision-empty">No revisions yet</div>}
          {revisions.map((item, index) => (
            <div key={item.id} className="revision-row">
              <div className="revision-meta">
                <span className="revision-number">#{item.revision}</span>
                <span className="revision-title">{item.title}</span>
                <span className="revision-time">{timeFormatter.format(new Date(item.updatedAt))}</span>
              </div>
              {index === 0 ? (
                <span className="revision-current">current</span>
              ) : (
                <button
                  type="button"
                  className="editor-action-button"
                  onClick={() => void handleRestore(item.revision)}
                  disabled={busyRevision !== null}
                >
                  {busyRevision === item.revision ? 'Restoring…' : 'Restore'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
