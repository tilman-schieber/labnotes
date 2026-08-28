import { useEffect, useState } from 'react';
import {
  addEntityAlias,
  deleteEntityAlias,
  fetchEntity,
  updateEntity,
  type BackendEntityDetail,
  type EntityUpdate
} from '../api/backend';

type Props = {
  entityId: string;
  types: string[];
  onChanged: () => void;
  onOpenDocument: (documentId: string) => void;
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

export default function EntityDetail({ entityId, types, onChanged, onOpenDocument }: Props) {
  const [detail, setDetail] = useState<BackendEntityDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

      <div className="entity-meta">
        <span>id {detail.entity.id}</span>
        <span>updated {new Date(detail.entity.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
