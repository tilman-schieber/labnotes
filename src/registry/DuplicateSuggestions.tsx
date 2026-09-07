import { useEffect, useState } from 'react';
import { fetchDuplicates, mergeEntities, type BackendDuplicateGroup } from '../api/backend';
import { confirmDialog } from '../ui/dialogs';

type Props = {
  onChanged: () => void;
  onSelect: (entityId: string) => void;
};

// Two verified compounds with the same PubChem CID or structure. The classifier folds drafts
// into existing entries on its own; these pairs were both entered by people, so a person decides.
export default function DuplicateSuggestions({ onChanged, onSelect }: Props) {
  const [groups, setGroups] = useState<BackendDuplicateGroup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetchDuplicates()
      .then(setGroups)
      .catch(() => setGroups([]));

  useEffect(() => {
    void load();
  }, []);

  if (groups.length === 0) {
    return null;
  }

  const merge = async (survivor: { id: string; label: string }, removed: { id: string; label: string }) => {
    const confirmed = await confirmDialog({
      title: `Merge “${removed.label}” into “${survivor.label}”?`,
      message: 'Both are the same substance. References are rewritten to the survivor and the other name becomes an alias.',
      confirmLabel: 'Merge'
    });
    if (!confirmed) {
      return;
    }
    setBusy(removed.id);
    setError(null);
    try {
      await mergeEntities(survivor.id, removed.id);
      await load();
      onChanged();
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : 'Merge failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="entity-section duplicate-suggestions">
      <h3>Possible duplicates</h3>
      <div className="entity-muted">Same PubChem record or same structure. Pick which name survives.</div>
      {error && <div className="entity-error">{error}</div>}
      <ul>
        {groups.map((group) => (
          <li key={group.entities.map((entity) => entity.id).join('+')} className="duplicate-group">
            {group.entities.map((entity, index) => (
              <span key={entity.id}>
                {index > 0 && <span className="entity-muted"> = </span>}
                <button type="button" className="link-button" onClick={() => onSelect(entity.id)}>
                  {entity.label}
                </button>
              </span>
            ))}
            <span className="duplicate-actions">
              {group.entities.map((survivor) => (
                <button key={survivor.id} type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void Promise.all(group.entities.filter((other) => other.id !== survivor.id).map((other) => merge(survivor, other)))}>
                  keep “{survivor.label}”
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
