import { useEffect, useMemo, useState } from 'react';
import { deleteEntity, fetchEntityLabels, mergeEntities, updateEntity, type BackendEntityLabel, type BackendEntityListItem } from '../api/backend';
import { confirmDialog } from '../ui/dialogs';
import { suggestMatches } from './reconcile';

type Props = {
  drafts: BackendEntityListItem[];
  types: string[];
  onChanged: () => void;
  onSelect: (entityId: string) => void;
};

const PROMOTE_TYPES = ['sample', 'reagent', 'compound', 'instrument', 'container', 'location'];

// Drafts are the names written with `#` that the registry did not know. Each becomes either an
// existing entity (merge), a new classified entity (promote), or nothing (delete).
export default function DraftReconciliation({ drafts, types, onChanged, onSelect }: Props) {
  const [known, setKnown] = useState<BackendEntityLabel[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoteType, setPromoteType] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchEntityLabels()
      .then(setKnown)
      .catch(() => setKnown([]));
  }, [drafts]);

  const draftIds = useMemo(() => new Set(drafts.map((draft) => draft.id)), [drafts]);
  const candidates = useMemo(() => known.filter((entity) => !draftIds.has(entity.id)), [known, draftIds]);
  const typeOptions = Array.from(new Set([...PROMOTE_TYPES, ...types.filter((type) => type !== 'unclassified' && type !== 'document')]));

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleMerge = (draft: BackendEntityListItem, target: BackendEntityLabel) =>
    run(draft.id, async () => {
      const confirmed = await confirmDialog({
        title: `“${draft.label}” is “${target.label}”?`,
        message: `References to the draft are rewritten to “${target.label}” and the draft name is kept as an alias.`,
        confirmLabel: 'Merge'
      });
      if (confirmed) {
        await mergeEntities(target.id, draft.id);
      }
    });

  const handlePromote = (draft: BackendEntityListItem) =>
    run(draft.id, () =>
      updateEntity(draft.id, {
        label: draft.label,
        type: promoteType[draft.id] ?? typeOptions[0],
        subtype: draft.subtype,
        status: 'verified',
        attributes: draft.attributes ?? {}
      })
    );

  const handleDelete = (draft: BackendEntityListItem) =>
    run(draft.id, async () => {
      const confirmed = await confirmDialog({ title: `Delete draft “${draft.label}”?`, message: 'It is not referenced anywhere.', confirmLabel: 'Delete', danger: true });
      if (confirmed) {
        await deleteEntity(draft.id);
      }
    });

  if (drafts.length === 0) {
    return null;
  }

  return (
    <div className="draft-panel">
      <div className="draft-panel-head">
        <strong>{drafts.length === 1 ? '1 draft' : `${drafts.length} drafts`}</strong> created while writing. Merge each into the entity it names, or classify it.
      </div>
      {error && <div className="status-inline">{error}</div>}
      <ul className="draft-list">
        {drafts.map((draft) => {
          const suggestions = suggestMatches(draft.label, candidates);
          const busy = busyId === draft.id;
          return (
            <li key={draft.id} className="draft-row">
              <div className="draft-row-head">
                <button type="button" className="link-button draft-label" onClick={() => onSelect(draft.id)}>
                  {draft.label}
                </button>
                <span className="entity-muted">
                  {draft.mentionCount} {draft.mentionCount === 1 ? 'reference' : 'references'}
                </span>
              </div>
              <div className="draft-actions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.entity.id}
                    type="button"
                    className={`linked-entity linked-entity-${suggestion.entity.type}`}
                    disabled={busy}
                    title={suggestion.reason}
                    onClick={() => void handleMerge(draft, suggestion.entity)}
                  >
                    = {suggestion.entity.label}
                    <span className="linked-entity-amount">{suggestion.entity.type}</span>
                  </button>
                ))}
                <span className="draft-promote">
                  <select value={promoteType[draft.id] ?? typeOptions[0]} disabled={busy} onChange={(event) => setPromoteType((current) => ({ ...current, [draft.id]: event.target.value }))} aria-label="Type">
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void handlePromote(draft)}>
                    Keep as new
                  </button>
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy || draft.mentionCount > 0}
                  title={draft.mentionCount > 0 ? 'Referenced in documents — merge it instead' : 'Remove this draft'}
                  onClick={() => void handleDelete(draft)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
