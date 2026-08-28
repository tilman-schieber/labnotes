import { useEffect, useState } from 'react';
import {
  RELATION_PREDICATES,
  addEntityAlias,
  addEntityRelation,
  deleteEntityAlias,
  deleteEntityRelation,
  fetchEntity,
  mergeEntities,
  searchEntities,
  updateEntity,
  type BackendEntityDetail,
  type BackendEntitySearchResult,
  type EntityUpdate
} from '../api/backend';

// Debounced entity search used by the relation and merge pickers.
function useEntityPicker(queryText: string, excludeId: string, excludeDocuments: boolean) {
  const [results, setResults] = useState<BackendEntitySearchResult[]>([]);

  useEffect(() => {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchEntities(trimmed)
        .then((items) => {
          if (!cancelled) {
            setResults(items.filter((item) => item.id !== excludeId && (!excludeDocuments || !item.documentId)));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [queryText, excludeId, excludeDocuments]);

  return results;
}

type Props = {
  entityId: string;
  types: string[];
  onChanged: () => void;
  onOpenDocument: (documentId: string) => void;
  // Called with the surviving entity id after this entity was merged away.
  onMerged: (targetId: string) => void;
};

const STATUSES = ['draft', 'verified', 'archived'];

type FormState = {
  label: string;
  type: string;
  subtype: string;
  status: string;
  attributesText: string;
};

function toForm(detail: BackendEntityDetail): FormState {
  return {
    label: detail.entity.label,
    type: detail.entity.type,
    subtype: detail.entity.subtype ?? '',
    status: detail.entity.status,
    attributesText: JSON.stringify(detail.entity.attributes ?? {}, null, 2)
  };
}

export default function EntityDetail({ entityId, types, onChanged, onOpenDocument, onMerged }: Props) {
  const [detail, setDetail] = useState<BackendEntityDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const mergeCandidates = useEntityPicker(mergeQuery, entityId, true);
  const [isMerging, setIsMerging] = useState(false);
  const [relationPredicate, setRelationPredicate] = useState<string>(RELATION_PREDICATES[0]);
  const [relationQuery, setRelationQuery] = useState('');
  const relationCandidates = useEntityPicker(relationQuery, entityId, false);

  const load = async () => {
    try {
      const next = await fetchEntity(entityId);
      setDetail(next);
      setForm(toForm(next));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load entity');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  if (error && !detail) {
    return <div className="status-inline">{error}</div>;
  }

  if (!detail || !form) {
    return <div className="registry-placeholder">Loading…</div>;
  }

  // Document entities mirror the tree: label/type come from the document itself.
  const isDocument = detail.entity.documentId !== null;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
    setNotice(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    let attributes: Record<string, unknown>;
    try {
      const parsed: unknown = form.attributesText.trim() ? JSON.parse(form.attributesText) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Attributes must be a JSON object');
      }
      attributes = parsed as Record<string, unknown>;
    } catch (parseError) {
      setError(parseError instanceof Error ? `Attributes: ${parseError.message}` : 'Attributes must be valid JSON');
      return;
    }

    const update: EntityUpdate = {
      label: form.label.trim(),
      type: form.type,
      subtype: form.subtype.trim() || null,
      status: form.status,
      attributes
    };

    setIsSaving(true);
    try {
      await updateEntity(entityId, update);
      await load();
      onChanged();
      setNotice('Saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save entity');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAlias = async (event: React.FormEvent) => {
    event.preventDefault();
    const alias = newAlias.trim();
    if (!alias) {
      return;
    }

    try {
      await addEntityAlias(entityId, alias);
      setNewAlias('');
      await load();
    } catch (aliasError) {
      setError(aliasError instanceof Error ? aliasError.message : 'Failed to add alias');
    }
  };

  const handleMerge = async (target: BackendEntitySearchResult) => {
    const confirmed = window.confirm(
      `Merge "${detail.entity.label}" into "${target.label}"?\n\nReferences in documents are rewritten to "${target.label}", aliases move over, and "${detail.entity.label}" is deleted.`
    );
    if (!confirmed) {
      return;
    }

    setIsMerging(true);
    try {
      await mergeEntities(target.id, entityId);
      onMerged(target.id);
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : 'Failed to merge entity');
      setIsMerging(false);
    }
  };

  const handleAddRelation = async (object: BackendEntitySearchResult) => {
    try {
      await addEntityRelation(entityId, relationPredicate, object.id);
      setRelationQuery('');
      await load();
    } catch (relationError) {
      setError(relationError instanceof Error ? relationError.message : 'Failed to add relation');
    }
  };

  const handleRemoveRelation = async (relationId: string) => {
    try {
      await deleteEntityRelation(entityId, relationId);
      await load();
    } catch (relationError) {
      setError(relationError instanceof Error ? relationError.message : 'Failed to remove relation');
    }
  };

  const handleRemoveAlias = async (aliasId: string) => {
    try {
      await deleteEntityAlias(entityId, aliasId);
      await load();
    } catch (aliasError) {
      setError(aliasError instanceof Error ? aliasError.message : 'Failed to remove alias');
    }
  };

  return (
    <div className="entity-detail">
      <form className="entity-form" onSubmit={(event) => void handleSave(event)}>
        <label>
          Label
          <input
            type="text"
            value={form.label}
            onChange={(event) => updateField('label', event.target.value)}
            disabled={isDocument}
          />
        </label>

        <div className="entity-form-row">
          <label>
            Type
            <select value={form.type} onChange={(event) => updateField('type', event.target.value)} disabled={isDocument}>
              {Array.from(new Set([...types, form.type])).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subtype
            <input
              type="text"
              value={form.subtype}
              onChange={(event) => updateField('subtype', event.target.value)}
              disabled={isDocument}
            />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Attributes (JSON)
          <textarea
            rows={6}
            value={form.attributesText}
            onChange={(event) => updateField('attributesText', event.target.value)}
            spellCheck={false}
          />
        </label>

        {isDocument && (
          <div className="entity-hint">
            Mirrored from the document tree — edit the title in the notebook.{' '}
            <button type="button" className="link-button" onClick={() => onOpenDocument(detail.entity.documentId!)}>
              Open document
            </button>
          </div>
        )}

        <div className="entity-form-actions">
          <button type="submit" disabled={isSaving || !form.label.trim()}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          {notice && <span className="entity-notice">{notice}</span>}
          {error && <span className="entity-error">{error}</span>}
        </div>
      </form>

      <section className="entity-section">
        <h3>Aliases</h3>
        <ul className="entity-alias-list">
          {detail.aliases.length === 0 && <li className="entity-muted">No aliases</li>}
          {detail.aliases.map((alias) => (
            <li key={alias.id}>
              <span>{alias.alias}</span>
              <span className="entity-muted">{alias.kind}</span>
              {alias.kind !== 'title' && (
                <button type="button" className="link-button" onClick={() => void handleRemoveAlias(alias.id)}>
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <form className="entity-alias-form" onSubmit={(event) => void handleAddAlias(event)}>
          <input
            type="text"
            placeholder="Add alias"
            value={newAlias}
            onChange={(event) => setNewAlias(event.target.value)}
          />
          <button type="submit" disabled={!newAlias.trim()}>
            Add
          </button>
        </form>
      </section>

      <section className="entity-section">
        <h3>Relations</h3>
        <ul className="entity-relation-list">
          {detail.relations.length === 0 && <li className="entity-muted">No relations</li>}
          {detail.relations.map((relation) => {
            const outgoing = relation.subjectEntityId === entityId;
            return (
              <li key={relation.id}>
                {outgoing ? (
                  <>
                    <span className="entity-predicate">{relation.predicate}</span>
                    <span>{relation.objectLabel}</span>
                    <span className="entity-muted">{relation.objectType}</span>
                  </>
                ) : (
                  <>
                    <span>{relation.subjectLabel}</span>
                    <span className="entity-predicate">{relation.predicate}</span>
                    <span className="entity-muted">this</span>
                  </>
                )}
                {relation.sourceDocumentTitle && <span className="entity-muted">from {relation.sourceDocumentTitle}</span>}
                <button type="button" className="link-button" onClick={() => void handleRemoveRelation(relation.id)}>
                  remove
                </button>
              </li>
            );
          })}
        </ul>
        <div className="entity-relation-form">
          <select value={relationPredicate} onChange={(event) => setRelationPredicate(event.target.value)} aria-label="Predicate">
            {RELATION_PREDICATES.map((predicate) => (
              <option key={predicate} value={predicate}>
                {predicate}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search the related entity"
            value={relationQuery}
            onChange={(event) => setRelationQuery(event.target.value)}
          />
        </div>
        {relationCandidates.length > 0 && (
          <ul className="entity-merge-list">
            {relationCandidates.map((candidate) => (
              <li key={candidate.id}>
                <span>{candidate.label}</span>
                <span className="entity-muted">{candidate.description}</span>
                <button type="button" className="link-button" onClick={() => void handleAddRelation(candidate)}>
                  add "{relationPredicate}"
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="entity-section">
        <h3>Referenced in</h3>
        <ul className="entity-backlink-list">
          {detail.backlinks.length === 0 && <li className="entity-muted">Not referenced yet</li>}
          {detail.backlinks.map((backlink) => (
            <li key={backlink.id}>
              <button type="button" className="link-button" onClick={() => onOpenDocument(backlink.documentId)}>
                {backlink.documentTitle}
              </button>
              <span className="entity-muted">{backlink.documentKind}</span>
            </li>
          ))}
        </ul>
      </section>

      {!isDocument && (
        <section className="entity-section">
          <h3>Merge into another entity</h3>
          <input
            type="search"
            placeholder="Search the entity to keep"
            value={mergeQuery}
            onChange={(event) => setMergeQuery(event.target.value)}
            disabled={isMerging}
          />
          {mergeCandidates.length > 0 && (
            <ul className="entity-merge-list">
              {mergeCandidates.map((candidate) => (
                <li key={candidate.id}>
                  <span>{candidate.label}</span>
                  <span className="entity-muted">{candidate.description}</span>
                  <button type="button" className="link-button" onClick={() => void handleMerge(candidate)} disabled={isMerging}>
                    merge into this
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mergeQuery.trim() && mergeCandidates.length === 0 && <div className="entity-muted">No other entities match</div>}
        </section>
      )}

      <div className="entity-meta">
        <span>id {detail.entity.id}</span>
        <span>updated {new Date(detail.entity.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
