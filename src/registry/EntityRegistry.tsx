import { useCallback, useEffect, useState } from 'react';
import { createEntity, fetchEntities, type BackendEntityListItem } from '../api/backend';
import EntityDetail from './EntityDetail';
import { expiryState } from './attributeSchema';

type Props = {
  onOpenDocument: (documentId: string) => void;
  // Entity to show on open (e.g. from a linked-entity chip in the editor).
  initialSelectedId?: string | null;
};

const STATUSES = ['draft', 'verified', 'archived'];
// Offered when creating from the registry; the type select also lists whatever already exists.
const BASE_TYPES = ['sample', 'specimen', 'reagent', 'compound', 'instrument', 'container', 'location'];

export default function EntityRegistry({ onOpenDocument, initialSelectedId = null }: Props) {
  const [queryText, setQueryText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [entities, setEntities] = useState<BackendEntityListItem[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState(BASE_TYPES[0]);
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  const visibleEntities = onlyExpiring ? entities.filter((entity) => expiryState(entity.attributes) !== null) : entities;

  const reload = useCallback(async () => {
    try {
      const result = await fetchEntities({ q: queryText, type: typeFilter, status: statusFilter });
      setEntities(result.entities);
      setTypes(Array.from(new Set([...BASE_TYPES, ...result.types])).sort());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load entities');
    }
  }, [queryText, typeFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 150);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) {
      return;
    }

    try {
      const entity = await createEntity(newType, label);
      setNewLabel('');
      await reload();
      setSelectedId(entity.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create entity');
    }
  };

  return (
    <div className="registry">
      <div className="registry-list">
        <div className="registry-filters">
          <input
            type="search"
            placeholder="Search label or alias"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Type">
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <label className="registry-toggle">
            <input type="checkbox" checked={onlyExpiring} onChange={(event) => setOnlyExpiring(event.target.checked)} />
            Expiring
          </label>
        </div>

        <form className="registry-create" onSubmit={(event) => void handleCreate(event)}>
          <input
            type="text"
            placeholder="New entity label"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
          />
          <select value={newType} onChange={(event) => setNewType(event.target.value)} aria-label="New entity type">
            {BASE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!newLabel.trim()}>
            Create
          </button>
        </form>

        {error && <div className="status-inline">{error}</div>}

        <table className="registry-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Status</th>
              <th className="is-numeric">Refs</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntities.length === 0 && (
              <tr>
                <td colSpan={4} className="registry-empty">
                  No entities match
                </td>
              </tr>
            )}
            {visibleEntities.map((entity) => (
              <tr
                key={entity.id}
                className={`registry-row${entity.id === selectedId ? ' is-active' : ''}${entity.status === 'archived' ? ' is-archived' : ''}`}
                onClick={() => setSelectedId(entity.id)}
              >
                <td>
                  {entity.label}
                  {expiryState(entity.attributes) && (
                    <span className={`entity-expiry-badge entity-expiry-${expiryState(entity.attributes)}`}>
                      {expiryState(entity.attributes) === 'expired' ? 'expired' : 'expiring'}
                    </span>
                  )}
                </td>
                <td>{entity.subtype ? `${entity.type} / ${entity.subtype}` : entity.type}</td>
                <td>{entity.status}</td>
                <td className="is-numeric">{entity.mentionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="registry-detail">
        {selectedId ? (
          <EntityDetail
            key={selectedId}
            entityId={selectedId}
            types={types}
            onChanged={() => void reload()}
            onOpenDocument={onOpenDocument}
            onMerged={(targetId) => {
              setSelectedId(targetId);
              void reload();
            }}
          />
        ) : (
          <div className="registry-placeholder">Select an entity to view details, aliases, and backlinks.</div>
        )}
      </div>
    </div>
  );
}
