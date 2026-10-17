import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';
import { searchEntities, type BackendEntitySearchResult } from '../api/backend';
import { parseResultsGrid, type ResultsAttrs, type ResultsColumn, type ResultsRow } from '../chemistry/results';
import { newId } from './extensions/Results';

// A small typed table: one row per sample, one column per measure. Rows name registry entities
// (matched against the references already in the document when pasted), so each number is a
// result on that entity, shown on its timeline. Paste a spreadsheet export to fill it.

type EntityRef = { id: string; label: string; type: string | null };

function documentEntities(editor: NodeViewProps['editor']): EntityRef[] {
  const found = new Map<string, EntityRef>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'entityMention' && node.attrs.id && !found.has(String(node.attrs.id))) {
      found.set(String(node.attrs.id), { id: String(node.attrs.id), label: String(node.attrs.label ?? ''), type: node.attrs.entityType ? String(node.attrs.entityType) : null });
    }
    if (node.type.name === 'plate') {
      for (const group of (node.attrs.groups as { entityId?: string | null; label?: string; entityType?: string | null }[]) ?? []) {
        if (group.entityId && !found.has(group.entityId)) {
          found.set(group.entityId, { id: group.entityId, label: group.label ?? '', type: group.entityType ?? null });
        }
      }
    }
  });
  return [...found.values()];
}

function SampleCell({ row, disabled, candidates, onChange }: { row: ResultsRow; disabled: boolean; candidates: EntityRef[]; onChange: (changes: Partial<ResultsRow>) => void }) {
  const [query, setQuery] = useState(row.label);
  const [results, setResults] = useState<BackendEntitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(row.label);
  }, [row.label]);

  useEffect(() => {
    if (!isOpen || !query.trim() || disabled) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchEntities(query)
        .then((items) => {
          if (!cancelled) {
            setResults(items.filter((item) => item.type !== 'document').slice(0, 6));
          }
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, isOpen, disabled]);

  // Names already referenced in this document come first, without a round trip.
  const local = query.trim() ? candidates.filter((candidate) => candidate.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 4) : [];
  const remote = results.filter((result) => !local.some((candidate) => candidate.id === result.id));

  return (
    <span className="results-sample">
      <input
        type="text"
        className="reaction-input results-sample-input"
        value={query}
        placeholder="sample"
        disabled={disabled}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          onChange({ label: event.target.value, entityId: null, entityType: null });
        }}
      />
      {row.entityId ? <span className={`badge type-badge type-${row.entityType ?? 'entity'}`} title="A registry entity: its values become results">{row.entityType ?? 'entity'}</span> : row.label ? <span className="entity-muted results-unlinked" title="Not a registry entity; pick one from the list to record results">?</span> : null}
      {isOpen && (local.length > 0 || remote.length > 0) && (
        <div className="mention-list results-sample-list">
          {[...local.map((candidate) => ({ id: candidate.id, label: candidate.label, type: candidate.type ?? 'entity', meta: 'in this document' })), ...remote.map((result) => ({ id: result.id, label: result.label, type: result.type, meta: result.type }))].map((item) => (
            <div
              key={item.id}
              className="mention-item"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsOpen(false);
                onChange({ label: item.label, entityId: item.id, entityType: item.type });
              }}
            >
              <div className="mention-item-label">{item.label}</div>
              <div className="mention-item-meta">{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export default function ResultsView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const attrs = node.attrs as ResultsAttrs;
  const disabled = !editor.isEditable;
  const [isPasting, setIsPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const candidates = useMemo(() => documentEntities(editor), [editor.state.doc]);

  const update = (changes: Partial<ResultsAttrs>) => updateAttributes(changes);
  const patchRow = (id: string, changes: Partial<ResultsRow>) => update({ rows: attrs.rows.map((row) => (row.id === id ? { ...row, ...changes } : row)) });
  const patchColumn = (id: string, changes: Partial<ResultsColumn>) => update({ columns: attrs.columns.map((column) => (column.id === id ? { ...column, ...changes } : column)) });
  const setValue = (rowId: string, columnId: string, raw: string) => {
    const row = attrs.rows.find((item) => item.id === rowId);
    if (!row) {
      return;
    }
    const values = { ...row.values };
    if (raw.trim() === '') {
      delete values[columnId];
    } else {
      const value = Number(raw.replace(',', '.'));
      if (Number.isFinite(value)) {
        values[columnId] = value;
      }
    }
    patchRow(rowId, { values });
  };

  const addRow = () => update({ rows: [...attrs.rows, { id: newId(), entityId: null, entityType: null, label: '', values: {}, note: '' }] });
  const addColumn = () => update({ columns: [...attrs.columns, { id: newId(), label: '', unit: '' }] });
  const removeRow = (id: string) => update({ rows: attrs.rows.filter((row) => row.id !== id) });
  const removeColumn = (id: string) =>
    update({ columns: attrs.columns.filter((column) => column.id !== id), rows: attrs.rows.map((row) => ({ ...row, values: Object.fromEntries(Object.entries(row.values).filter(([key]) => key !== id)) })) });

  const matchEntity = (label: string): EntityRef | null => {
    const needle = label.trim().toLowerCase();
    return candidates.find((candidate) => candidate.label.toLowerCase() === needle) ?? null;
  };

  const applyPaste = () => {
    const grid = parseResultsGrid(pasteText);
    if (grid.columns.length === 0) {
      return;
    }
    // Existing columns are reused by label; empty placeholder columns and rows are replaced.
    const columns = attrs.columns.filter((column) => column.label.trim() !== '');
    const columnIds = grid.columns.map((pasted) => {
      const existing = columns.find((column) => column.label.toLowerCase() === pasted.label.toLowerCase());
      if (existing) {
        return existing.id;
      }
      const column = { id: newId(), label: pasted.label, unit: pasted.unit };
      columns.push(column);
      return column.id;
    });
    const rows = attrs.rows.filter((row) => row.label.trim() !== '' || Object.keys(row.values).length > 0);
    for (const pasted of grid.rows) {
      const match = matchEntity(pasted.label);
      const existing = rows.find((row) => row.label.toLowerCase() === pasted.label.toLowerCase());
      const values: Record<string, number | null> = { ...(existing?.values ?? {}) };
      pasted.values.forEach((value, index) => {
        if (value !== null) {
          values[columnIds[index]] = value;
        }
      });
      if (existing) {
        existing.values = values;
      } else {
        rows.push({ id: newId(), entityId: match?.id ?? null, entityType: match?.type ?? null, label: match?.label ?? pasted.label, values, note: '' });
      }
    }
    update({ columns, rows });
    setIsPasting(false);
    setPasteText('');
  };

  const linked = attrs.rows.filter((row) => row.entityId).length;

  return (
    <NodeViewWrapper className={`results-block${selected ? ' is-selected' : ''}`} data-drag-handle>
      <div className="results-header">
        <input type="text" className="reaction-title" value={attrs.title} placeholder="Results" disabled={disabled} onChange={(event) => update({ title: event.target.value })} />
        <span className="entity-muted results-count">
          {linked} of {attrs.rows.length} {attrs.rows.length === 1 ? 'row is' : 'rows are'} registry entities
        </span>
        {!disabled && (
          <button type="button" className="btn btn-sm" onClick={() => setIsPasting((open) => !open)} title="Paste a spreadsheet: header row with the measures, one row per sample">
            Paste…
          </button>
        )}
      </div>

      {isPasting && !disabled && (
        <div className="plate-paste">
          <textarea
            className="plate-paste-text"
            rows={6}
            value={pasteText}
            placeholder={'Sample\tOD600\tViability (%)\nCulture A\t1.21\t95\nCulture B\t0.98\t91'}
            onChange={(event) => setPasteText(event.target.value)}
          />
          <div className="plate-paste-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={applyPaste} disabled={!pasteText.trim()}>
              Apply
            </button>
            <button type="button" className="link-button" onClick={() => setIsPasting(false)}>
              cancel
            </button>
            <span className="entity-muted">Sample names matching a reference in this document are linked automatically.</span>
          </div>
        </div>
      )}

      <div className="reaction-table-wrap">
        <table className="reaction-table results-table">
          <thead>
            <tr>
              <th>Sample</th>
              {attrs.columns.map((column) => (
                <th key={column.id}>
                  {disabled ? (
                    <span>
                      {column.label || '—'}
                      {column.unit && <span className="entity-muted"> ({column.unit})</span>}
                    </span>
                  ) : (
                    <span className="results-column-head">
                      <input type="text" className="reaction-input results-measure" value={column.label} placeholder="measure" onChange={(event) => patchColumn(column.id, { label: event.target.value })} />
                      <input type="text" className="reaction-input results-unit" value={column.unit} placeholder="unit" onChange={(event) => patchColumn(column.id, { unit: event.target.value })} />
                      {attrs.columns.length > 1 && (
                        <button type="button" className="link-button" onClick={() => removeColumn(column.id)} aria-label="Remove column">
                          ×
                        </button>
                      )}
                    </span>
                  )}
                </th>
              ))}
              <th>Note</th>
              {!disabled && <th />}
            </tr>
          </thead>
          <tbody>
            {attrs.rows.map((row) => (
              <tr key={row.id} className={row.entityId ? 'is-linked' : undefined}>
                <td>
                  {disabled ? (
                    <span>
                      {row.label || '—'}
                      {row.entityId && <span className={`badge type-badge type-${row.entityType ?? 'entity'}`}>{row.entityType}</span>}
                    </span>
                  ) : (
                    <SampleCell row={row} disabled={disabled} candidates={candidates} onChange={(changes) => patchRow(row.id, changes)} />
                  )}
                </td>
                {attrs.columns.map((column) => (
                  <td key={column.id} className="results-value-cell">
                    {disabled ? (
                      <span>{row.values[column.id] ?? ''}</span>
                    ) : (
                      <input type="text" inputMode="decimal" className="reaction-input results-value" value={row.values[column.id] ?? ''} placeholder="—" onChange={(event) => setValue(row.id, column.id, event.target.value)} />
                    )}
                  </td>
                ))}
                <td>{disabled ? <span className="entity-muted">{row.note}</span> : <input type="text" className="reaction-input results-note" value={row.note} placeholder="note" onChange={(event) => patchRow(row.id, { note: event.target.value })} />}</td>
                {!disabled && (
                  <td>
                    <button type="button" className="link-button" onClick={() => removeRow(row.id)} aria-label="Remove row">
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <div className="reaction-actions">
          <button type="button" onClick={addRow}>
            + row
          </button>
          <button type="button" onClick={addColumn}>
            + measure
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
