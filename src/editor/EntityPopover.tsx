import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { fetchEntity, updateEntity, type BackendEntityDetail } from '../api/backend';
import { describeSmiles, isCompoundAttributes, smilesToSvg } from '../chemistry/molecule';
import AttributeFields from '../registry/AttributeFields';
import StructureEditorDialog from '../registry/StructureEditorDialog';
import { ATTRIBUTE_SCHEMA } from '../registry/attributeSchema';
import { DRAFT_TYPE, PROMOTABLE_TYPES, isChemical } from '../registry/typeCatalog';
import { invalidateEntityCache } from './extensions/CompoundToken';
import { refreshEntityTypes } from './entityTypes';

// Editing an entity without leaving the page. Clicking a reference pins this under the token:
// the label, the type (a draft gets a row of buttons), the handful of attributes that matter for
// that type, and for compounds the SMILES. The registry stays the place for aliases, relations
// and merges; everything a writer needs mid-sentence is here.

type Props = {
  entityId: string;
  editor: Editor | null;
  // Compound tokens can show their structure inline; the popover hosts the toggle.
  inlineStructure: boolean | null;
  onToggleInline: (() => void) | null;
  onClose: () => void;
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function closeEntityPopover(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

export function isEntityPopoverOpen(): boolean {
  return host !== null;
}

export function openEntityPopover(anchor: HTMLElement, props: Omit<Props, 'onClose'>): void {
  closeEntityPopover();
  host = document.createElement('div');
  host.className = 'entity-popover-host';
  document.body.appendChild(host);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  host.style.left = `${Math.max(12, Math.min(rect.left + window.scrollX, window.innerWidth - width - 12))}px`;
  host.style.top = `${rect.bottom + window.scrollY + 6}px`;
  host.style.width = `${width}px`;
  root = createRoot(host);
  root.render(<EntityPopover {...props} onClose={closeEntityPopover} />);
}

// Updates every token of this entity in the open document when its label changed.
function relabelTokens(editor: Editor | null, entityId: string, label: string): void {
  if (!editor) {
    return;
  }
  const { tr, doc } = editor.state;
  let changed = false;
  doc.descendants((node, pos) => {
    if (node.type.name === 'entityMention' && node.attrs.id === entityId && node.attrs.label !== label) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, label });
      changed = true;
    }
  });
  if (changed) {
    editor.view.dispatch(tr);
  }
}

function EntityPopover({ entityId, editor, inlineStructure, onToggleInline, onClose }: Props) {
  const [detail, setDetail] = useState<BackendEntityDetail | null>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('');
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [smiles, setSmiles] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The Ketcher dialog is portalled outside the popover; while it is open the popover stays.
  const [isDrawing, setIsDrawing] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEntity(entityId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setDetail(next);
        setLabel(next.entity.label);
        setType(next.entity.type);
        setAttributes(next.entity.attributes ?? {});
        setSmiles(isCompoundAttributes(next.entity.attributes) ? next.entity.attributes.smiles ?? '' : '');
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load the entity'));
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  useEffect(() => {
    if (!smiles.trim() || !isChemical(type)) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    smilesToSvg(smiles.trim(), 200, 110)
      .then((image) => {
        if (!cancelled) {
          setSvg(image);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [smiles, type]);

  // Escape or a click elsewhere closes; the editor keeps working underneath. With the structure
  // editor open, Escape closes that instead and clicks in it are not "elsewhere".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (isDrawing) {
          setIsDrawing(false);
        } else {
          onClose();
        }
      }
    };
    const onDown = (event: MouseEvent) => {
      if (!isDrawing && container.current && !container.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose, isDrawing]);


  const isDraft = detail?.entity.status === 'draft';
  const isDocument = detail?.entity.type === 'document';

  const save = async () => {
    if (!detail) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let nextAttributes = { ...attributes };
      if (isChemical(type)) {
        const trimmed = smiles.trim();
        if (trimmed) {
          const description = await describeSmiles(trimmed);
          if (!description) {
            throw new Error('That SMILES does not parse');
          }
          nextAttributes = { ...nextAttributes, ...description };
        } else {
          delete nextAttributes.smiles;
        }
      }
      const trimmedLabel = label.trim() || detail.entity.label;
      // A draft given a real type is classified: that is what "verified" means here.
      const status = detail.entity.status === 'draft' && type !== DRAFT_TYPE ? 'verified' : detail.entity.status;
      await updateEntity(entityId, { label: trimmedLabel, type, subtype: detail.entity.subtype ?? null, status, attributes: nextAttributes });
      invalidateEntityCache(entityId);
      relabelTokens(editor, entityId, trimmedLabel);
      window.dispatchEvent(new CustomEvent('labnotes:entities-changed'));
      void refreshEntityTypes();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const openRegistry = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('labnotes:open-entity', { detail: { entityId } }));
  };

  if (!detail) {
    return (
      <div ref={container} className="entity-popover">
        <div className="entity-muted">{error ?? 'Loading…'}</div>
      </div>
    );
  }

  const typeOptions = Array.from(new Set([...PROMOTABLE_TYPES, type].filter((option) => option !== DRAFT_TYPE)));

  return (
    <div ref={container} className="entity-popover" role="dialog" aria-label={`Edit ${detail.entity.label}`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="entity-popover-head">
          <input type="text" className="entity-popover-label" value={label} onChange={(event) => setLabel(event.target.value)} disabled={isDocument} aria-label="Name" />
          <span className={`badge type-badge type-${type}`}>{isDraft ? 'draft' : type}</span>
        </div>

        {isDocument ? (
          <div className="entity-muted">A notebook document. Its title is edited in the notebook.</div>
        ) : (
          <>
            {isDraft || type === DRAFT_TYPE ? (
              <div className="entity-popover-types">
                <span className="entity-muted">This is a</span>
                {typeOptions.map((option) => (
                  <button key={option} type="button" className={`chip-button${type === option ? ' is-active' : ''}`} onClick={() => setType(option)}>
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <label className="entity-popover-row">
                Type
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  {typeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isChemical(type) && (
              <label className="entity-popover-row">
                SMILES
                <span className="entity-popover-smiles">
                  <input type="text" value={smiles} placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O" spellCheck={false} onChange={(event) => setSmiles(event.target.value)} />
                  <button type="button" className="btn btn-sm" onClick={() => setIsDrawing(true)} title="Draw the structure in Ketcher">
                    Draw…
                  </button>
                </span>
              </label>
            )}
            {svg && <div className="entity-popover-svg" dangerouslySetInnerHTML={{ __html: svg }} />}

            {(ATTRIBUTE_SCHEMA[type] ?? []).length > 0 && <AttributeFields type={type} attributes={attributes} onChange={setAttributes} />}
          </>
        )}

        {error && <div className="entity-error">{error}</div>}

        <div className="entity-popover-actions">
          {!isDocument && (
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {onToggleInline && isChemical(type) && (
            <button type="button" className="btn btn-sm" onClick={onToggleInline}>
              {inlineStructure ? 'Hide structure in text' : 'Show structure in text'}
            </button>
          )}
          <button type="button" className="link-button" onClick={openRegistry}>
            Open in registry
          </button>
        </div>
      </form>

      {isDrawing && (
        <StructureEditorDialog
          initialStructure={smiles}
          onCancel={() => setIsDrawing(false)}
          onSave={(drawn) => {
            setIsDrawing(false);
            setSmiles(drawn);
          }}
        />
      )}
    </div>
  );
}
