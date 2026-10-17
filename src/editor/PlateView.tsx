import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createEntity, searchEntities, type BackendEntitySearchResult } from '../api/backend';
import {
  PALETTE,
  PLATE_FORMATS,
  createGroup,
  fitWells,
  formatValue,
  groupStats,
  parseValueGrid,
  plateLayout,
  rowLabel,
  setWell,
  summarizeNotes,
  valueRange,
  wellAt,
  wellId,
  type PlateAttrs,
  type PlateFormat,
  type PlateGroup,
  type PlateWell
} from '../plates/plate';

// The plate is painted, not typed: pick a group in the legend, then click or drag over wells
// (or a row/column header). Values come in as one paste from the reader export and show as a
// heat map; the legend sums them up per group.

type Tool = { kind: 'select' } | { kind: 'erase' } | { kind: 'group'; id: string };

const ERASE: Tool = { kind: 'erase' };
const SELECT: Tool = { kind: 'select' };

function heat(value: number, range: { min: number; max: number }): string {
  const span = range.max - range.min;
  const t = span > 0 ? (value - range.min) / span : 1;
  // Pale yellow → deep orange-red, readable on a white page and in print.
  const light = 96 - t * 44;
  return `hsl(${38 - t * 26} 92% ${light}%)`;
}

// One legend row: colour, name, optional registry entity, counts, and the brush selection.
function LegendRow({
  group,
  stats,
  active,
  disabled,
  measure,
  onPick,
  onChange,
  onRemove
}: {
  group: PlateGroup;
  stats: ReturnType<typeof groupStats>;
  active: boolean;
  disabled: boolean;
  measure: string;
  onPick: () => void;
  onChange: (changes: Partial<PlateGroup>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(group.label);
  const [results, setResults] = useState<BackendEntitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(group.label);
  }, [group.label]);

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

  const cycleColor = () => {
    const index = PALETTE.indexOf(group.color);
    onChange({ color: PALETTE[(index + 1) % PALETTE.length] });
  };

  const summary = stats.measured > 0 && stats.mean !== null ? `${formatValue(stats.mean)}${stats.sd !== null ? ` ± ${formatValue(stats.sd)}` : ''}${measure ? ` ${measure}` : ''}` : '';

  return (
    <div className={`plate-legend-row${active ? ' is-active' : ''}`}>
      <button type="button" className="plate-swatch" style={{ background: group.color }} onClick={disabled ? undefined : cycleColor} title={disabled ? group.label : 'Click to change the colour'} aria-label="Colour" />
      <span className="plate-legend-name">
        <input
          type="text"
          className="reaction-input plate-legend-input"
          value={query}
          placeholder="what is in these wells"
          disabled={disabled}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            // Typing a new name detaches the registry entity; picking one below attaches it again.
            onChange({ label: event.target.value, entityId: null, entityType: null });
          }}
        />
        {group.entityId && <span className={`badge type-badge type-${group.entityType ?? 'entity'}`}>{group.entityType}</span>}
        {isOpen && results.length > 0 && (
          <div className="mention-list plate-legend-results">
            {results.map((result) => (
              <div
                key={result.id}
                className="mention-item"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setIsOpen(false);
                  onChange({ label: result.label, entityId: result.id, entityType: result.type });
                }}
              >
                <div className="mention-item-label">{result.label}</div>
                <div className="mention-item-meta">{result.type}</div>
              </div>
            ))}
          </div>
        )}
      </span>
      <span className="plate-legend-stats" title={stats.measured > 0 ? `${stats.measured} of ${stats.count} wells measured; mean ± sd` : `${stats.count} wells`}>
        {stats.count} {stats.count === 1 ? 'well' : 'wells'}
        {summary && <span className="plate-legend-mean"> · {summary}</span>}
      </span>
      {!disabled && (
        <>
          <button type="button" className={`btn btn-sm${active ? ' btn-primary' : ''}`} onClick={onPick} title="Paint wells with this group">
            {active ? 'Painting' : 'Paint'}
          </button>
          <button type="button" className="link-button plate-legend-remove" onClick={onRemove} title="Remove the group; its wells become empty">
            ×
          </button>
        </>
      )}
    </div>
  );
}

export default function PlateView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const attrs = node.attrs as PlateAttrs;
  const disabled = !editor.isEditable;
  const { rows, cols } = plateLayout(attrs.format);
  const range = useMemo(() => valueRange(attrs), [attrs.wells]);
  const hasValues = range !== null;

  const [tool, setTool] = useState<Tool>(SELECT);
  const [view, setView] = useState<'groups' | 'values'>(hasValues ? 'values' : 'groups');
  const [selectedWell, setSelectedWell] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const painting = useRef(false);

  // A pasted set of values switches to the heat map; a cleared one back to the layout.
  useEffect(() => {
    setView(hasValues ? 'values' : 'groups');
  }, [hasValues]);

  // A removed group leaves no dangling brush.
  useEffect(() => {
    if (tool.kind === 'group' && !attrs.groups.some((group) => group.id === tool.id)) {
      setTool(SELECT);
    }
  }, [attrs.groups, tool]);

  useEffect(() => {
    const stop = () => {
      painting.current = false;
    };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const groupById = useMemo(() => new Map(attrs.groups.map((group) => [group.id, group])), [attrs.groups]);
  const update = (changes: Partial<PlateAttrs>) => updateAttributes(changes);

  const applyTool = (ids: string[]) => {
    if (disabled || tool.kind === 'select') {
      return;
    }
    let wells = attrs.wells;
    for (const id of ids) {
      wells = setWell(wells, id, { group: tool.kind === 'erase' ? null : tool.id });
    }
    update({ wells });
  };

  const onWellDown = (id: string) => {
    if (tool.kind === 'select') {
      setSelectedWell((current) => (current === id ? null : id));
      return;
    }
    painting.current = true;
    applyTool([id]);
  };

  const onWellEnter = (id: string) => {
    if (painting.current) {
      applyTool([id]);
    }
  };

  const rowIds = (row: number) => Array.from({ length: cols }, (_, col) => wellId(row, col));
  const colIds = (col: number) => Array.from({ length: rows }, (_, row) => wellId(row, col));

  const addGroup = () => {
    const group = createGroup('', attrs.groups);
    update({ groups: [...attrs.groups, group] });
    setTool({ kind: 'group', id: group.id });
  };

  const changeGroup = (id: string, changes: Partial<PlateGroup>) => update({ groups: attrs.groups.map((group) => (group.id === id ? { ...group, ...changes } : group)) });

  const removeGroup = (id: string) => {
    let wells = attrs.wells;
    for (const [wellKey, well] of Object.entries(wells)) {
      if (well.group === id) {
        wells = setWell(wells, wellKey, { group: null });
      }
    }
    update({ groups: attrs.groups.filter((group) => group.id !== id), wells });
  };

  const changeFormat = (format: PlateFormat) => {
    update({ format, wells: fitWells(attrs.wells, format) });
    setSelectedWell(null);
  };

  const applyPaste = () => {
    const values = parseValueGrid(pasteText, attrs.format);
    let wells = attrs.wells;
    for (const [id, value] of Object.entries(values)) {
      wells = setWell(wells, id, { value });
    }
    update({ wells });
    setIsPasting(false);
    setPasteText('');
  };

  const clearValues = () => {
    let wells = attrs.wells;
    for (const id of Object.keys(wells)) {
      wells = setWell(wells, id, { value: null });
    }
    update({ wells });
  };

  const editWell = (id: string, changes: Partial<PlateWell>) => update({ wells: setWell(attrs.wells, id, changes) });

  const wellStyle = (well: PlateWell): CSSProperties => {
    const group = well.group ? groupById.get(well.group) : null;
    if (view === 'values' && well.value !== null && range) {
      return { background: heat(well.value, range), borderColor: group?.color ?? 'var(--border-strong)', borderWidth: group ? 3 : 1 };
    }
    return group ? { background: group.color, borderColor: group.color } : {};
  };

  const wellTitle = (id: string, well: PlateWell) => {
    const group = well.group ? groupById.get(well.group) : null;
    return [id, group?.label, well.note, well.value !== null ? `${formatValue(well.value)}${attrs.measure ? ` ${attrs.measure}` : ''}` : null].filter(Boolean).join(' · ');
  };

  const notes = useMemo(() => summarizeNotes(attrs), [attrs.wells, attrs.format]);
  const noteLine = [
    ...notes.columns.map((item) => `col ${item.index + 1}: ${item.note}`),
    ...notes.rows.map((item) => `row ${rowLabel(item.index)}: ${item.note}`),
    ...notes.wells.slice(0, 12).map((item) => `${item.id}: ${item.note}`),
    ...(notes.wells.length > 12 ? [`… ${notes.wells.length - 12} more`] : [])
  ].join(' · ');
  const [registering, setRegistering] = useState(false);
  const [registeredLabel, setRegisteredLabel] = useState<string | null>(null);
  // The plate becomes a container in the registry: "#P-… " in a later entry inherits the layout
  // by reference, and the plate shows up on the Storage & places shelf.
  const registerPlate = async () => {
    setRegistering(true);
    try {
      const label = attrs.title.trim() || `${attrs.format}-well plate ${new Date().toISOString().slice(0, 10)}`;
      const entity = await createEntity('container', label, 'verified', { attributes: { kind: 'microplate', format: attrs.format } });
      update({ entityId: entity.id });
      setRegisteredLabel(entity.label);
      window.dispatchEvent(new CustomEvent('labnotes:entities-changed'));
    } finally {
      setRegistering(false);
    }
  };
  const current = selectedWell ? wellAt(attrs, selectedWell) : null;
  const filled = Object.values(attrs.wells).filter((well) => well.group !== null).length;

  return (
    <NodeViewWrapper className={`plate-block plate-${attrs.format}${selected ? ' is-selected' : ''}`} data-drag-handle>
      <div className="plate-header">
        <input type="text" className="reaction-title plate-title" value={attrs.title} placeholder={`${attrs.format}-well plate`} disabled={disabled} onChange={(event) => update({ title: event.target.value })} />
        <select className="reaction-input plate-format" value={attrs.format} disabled={disabled} onChange={(event) => changeFormat(Number(event.target.value) as PlateFormat)} title="Plate format">
          {PLATE_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format} wells
            </option>
          ))}
        </select>
        <span className="plate-header-spacer" />
        {hasValues && (
          <span className="plate-view-toggle" role="group" aria-label="View">
            <button type="button" className={`btn btn-sm${view === 'groups' ? ' is-active' : ''}`} onClick={() => setView('groups')}>
              Layout
            </button>
            <button type="button" className={`btn btn-sm${view === 'values' ? ' is-active' : ''}`} onClick={() => setView('values')}>
              {attrs.measure || 'Values'}
            </button>
          </span>
        )}
        {attrs.entityId ? (
          <button type="button" className="link-button plate-registered" onClick={() => window.dispatchEvent(new CustomEvent('labnotes:open-entity', { detail: { entityId: attrs.entityId } }))} title="Registered as a container; open it in the registry">
            #{registeredLabel ?? attrs.title ?? 'plate'}
          </button>
        ) : (
          !disabled && (
            <button type="button" className="link-button" onClick={() => void registerPlate()} disabled={registering} title="Create a container entity for this plate so other entries can reference it">
              {registering ? 'Registering…' : 'Register as container'}
            </button>
          )
        )}
        {!disabled && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => setIsPasting((open) => !open)} title="Paste the reader export: one plate row per line">
              {hasValues ? 'Replace values…' : 'Paste values…'}
            </button>
            {hasValues && (
              <button type="button" className="link-button" onClick={clearValues}>
                clear values
              </button>
            )}
          </>
        )}
      </div>

      {isPasting && !disabled && (
        <div className="plate-paste">
          <label className="plate-paste-measure">
            Measured
            <input type="text" className="reaction-input" value={attrs.measure} placeholder="e.g. OD600" onChange={(event) => update({ measure: event.target.value })} />
          </label>
          <textarea
            className="plate-paste-text"
            rows={Math.min(rows + 1, 10)}
            value={pasteText}
            placeholder={`One plate row per line, ${cols} values each (tabs, commas or spaces). A header row and row letters are fine.`}
            onChange={(event) => setPasteText(event.target.value)}
          />
          <div className="plate-paste-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={applyPaste} disabled={!pasteText.trim()}>
              Apply to wells
            </button>
            <button type="button" className="link-button" onClick={() => setIsPasting(false)}>
              cancel
            </button>
          </div>
        </div>
      )}

      <div className="plate-body">
        <div className={`plate-grid${tool.kind !== 'select' && !disabled ? ' is-painting' : ''}`} style={{ gridTemplateColumns: `1.4rem repeat(${cols}, var(--well))` }}>
          <span className="plate-corner" />
          {Array.from({ length: cols }, (_, col) => (
            <button key={`c${col}`} type="button" className="plate-axis" onClick={() => applyTool(colIds(col))} disabled={disabled || tool.kind === 'select'} title={tool.kind === 'select' ? `Column ${col + 1}` : `Paint column ${col + 1}`}>
              {col + 1}
            </button>
          ))}
          {Array.from({ length: rows }, (_, row) => (
            <Row key={`r${row}`}>
              <button type="button" className="plate-axis" onClick={() => applyTool(rowIds(row))} disabled={disabled || tool.kind === 'select'} title={tool.kind === 'select' ? `Row ${rowLabel(row)}` : `Paint row ${rowLabel(row)}`}>
                {rowLabel(row)}
              </button>
              {Array.from({ length: cols }, (_, col) => {
                const id = wellId(row, col);
                const well = wellAt(attrs, id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`plate-well${well.group ? ' has-group' : ''}${well.note ? ' has-note' : ''}${selectedWell === id ? ' is-selected' : ''}`}
                    style={wellStyle(well)}
                    title={wellTitle(id, well)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      onWellDown(id);
                    }}
                    onPointerEnter={() => onWellEnter(id)}
                  >
                    {view === 'values' && well.value !== null ? <span className="plate-well-value">{formatValue(well.value)}</span> : null}
                  </button>
                );
              })}
            </Row>
          ))}
        </div>

        <div className="plate-legend">
          {!disabled && (
            <div className="plate-tools">
              <button type="button" className={`btn btn-sm${tool.kind === 'select' ? ' btn-primary' : ''}`} onClick={() => setTool(SELECT)} title="Click a well to edit its note or value">
                Inspect
              </button>
              <button type="button" className={`btn btn-sm${tool.kind === 'erase' ? ' btn-primary' : ''}`} onClick={() => setTool(ERASE)} title="Click or drag over wells to empty them">
                Erase
              </button>
              <span className="entity-muted plate-tools-hint">{tool.kind === 'select' ? 'Pick a group to paint wells, or click a well.' : 'Drag over wells, or click a row or column letter.'}</span>
            </div>
          )}
          {attrs.groups.map((group) => (
            <LegendRow
              key={group.id}
              group={group}
              stats={groupStats(attrs, group.id)}
              active={tool.kind === 'group' && tool.id === group.id}
              disabled={disabled}
              measure={attrs.measure}
              onPick={() => setTool(tool.kind === 'group' && tool.id === group.id ? SELECT : { kind: 'group', id: group.id })}
              onChange={(changes) => changeGroup(group.id, changes)}
              onRemove={() => removeGroup(group.id)}
            />
          ))}
          {!disabled && (
            <button type="button" className="link-button plate-add-group" onClick={addGroup}>
              + group
            </button>
          )}
          {attrs.groups.length === 0 && disabled && <div className="entity-muted">No layout recorded.</div>}
          {noteLine && <div className="entity-muted plate-notes">{noteLine}</div>}
          <div className="entity-muted plate-summary">
            {filled} of {rows * cols} wells assigned{hasValues ? ` · ${Object.values(attrs.wells).filter((well) => well.value !== null).length} values${attrs.measure ? ` (${attrs.measure})` : ''}` : ''}
          </div>
        </div>
      </div>

      {selectedWell && current && (
        <div className="plate-well-editor">
          <strong>{selectedWell}</strong>
          <select className="reaction-input" value={current.group ?? ''} disabled={disabled} onChange={(event) => editWell(selectedWell, { group: event.target.value || null })}>
            <option value="">empty</option>
            {attrs.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label || 'unnamed group'}
              </option>
            ))}
          </select>
          <input type="text" className="reaction-input plate-well-note" value={current.note} placeholder="note" disabled={disabled} onChange={(event) => editWell(selectedWell, { note: event.target.value })} />
          <input
            type="number"
            step="any"
            className="reaction-input"
            value={current.value ?? ''}
            placeholder={attrs.measure || 'value'}
            disabled={disabled}
            onChange={(event) => editWell(selectedWell, { value: event.target.value === '' ? null : Number(event.target.value) })}
          />
          <button type="button" className="link-button" onClick={() => setSelectedWell(null)}>
            done
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// CSS grid needs the cells as direct children; a fragment keeps the row keyed.
function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
