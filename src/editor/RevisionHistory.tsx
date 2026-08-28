import { useEffect, useState } from 'react';
import {
  fetchDocumentRevisions,
  restoreDocumentRevision,
  searchUsers,
  signDocumentRevision,
  type BackendRevisionSummary,
  type BackendUserSearchResult
} from '../api/backend';
import { IconHistory } from '../ui/icons';

type Props = {
  documentId: string | null;
  onRestored: () => void;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function RevisionHistory({ documentId, onRestored }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [revisions, setRevisions] = useState<BackendRevisionSummary[]>([]);
  const [users, setUsers] = useState<BackendUserSearchResult[]>([]);
  const [signerId, setSignerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyRevision, setBusyRevision] = useState<number | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [documentId]);

  const load = async () => {
    if (!documentId) {
      return;
    }
    try {
      const [items, activeUsers] = await Promise.all([fetchDocumentRevisions(documentId), searchUsers('')]);
      setRevisions(items);
      setUsers(activeUsers);
      setSignerId((current) => current || activeUsers[0]?.id || '');
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load history');
    }
  };

  useEffect(() => {
    if (isOpen && documentId) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSign = async (revision: number) => {
    if (!documentId || !signerId) {
      return;
    }
    const signer = users.find((user) => user.id === signerId);
    const note = window.prompt(`Sign revision ${revision} as ${signer?.label ?? signerId}?\n\nOptional note:`, '');
    if (note === null) {
      return;
    }

    setBusyRevision(revision);
    try {
      await signDocumentRevision(documentId, revision, signerId, note.trim() || undefined);
      await load();
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Failed to sign revision');
    } finally {
      setBusyRevision(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm${isOpen ? ' is-active' : ''}`}
        onClick={() => setIsOpen((previous) => !previous)}
        disabled={!documentId}
        title="Revision history"
      >
        <IconHistory size={14} />
        History
      </button>

      {isOpen && (
        <div className="revision-panel" role="dialog" aria-label="Revision history">
          {users.length > 0 && (
            <div className="revision-signer">
              <span className="entity-muted">Sign as</span>
              <select value={signerId} onChange={(event) => setSignerId(event.target.value)} aria-label="Signing user">
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <div className="revision-error">{error}</div>}
          {!error && revisions.length === 0 && <div className="revision-empty">No revisions yet</div>}
          {revisions.map((item, index) => (
            <div key={item.id} className={`revision-row${item.signedAt ? ' is-signed' : ''}`}>
              <div className="revision-meta">
                <span className="revision-number">
                  #{item.revision}
                  {item.signedAt && <span className="revision-signed-badge">signed</span>}
                </span>
                <span className="revision-title">{item.title}</span>
                <span className="revision-time">{timeFormatter.format(new Date(item.updatedAt))}</span>
                {item.signedAt && (
                  <span className="revision-time">
                    by {item.signedByName ?? item.signedBy} · {timeFormatter.format(new Date(item.signedAt))}
                    {item.signatureNote && ` · “${item.signatureNote}”`}
                  </span>
                )}
              </div>
              <div className="revision-actions">
                {!item.signedAt && signerId && (
                  <button type="button" className="btn btn-sm" onClick={() => void handleSign(item.revision)} disabled={busyRevision !== null}>
                    Sign
                  </button>
                )}
                {index === 0 ? (
                  <span className="revision-current">current</span>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => void handleRestore(item.revision)} disabled={busyRevision !== null}>
                    {busyRevision === item.revision ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
