import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { classifyEntities, createEntity, fetchEntities, fetchEntityCounts, type BackendEntityCount, type BackendEntityListItem } from '../api/backend';
import { smilesToSvg } from '../chemistry/molecule';
import DraftReconciliation from './DraftReconciliation';
import EntityDetail from './EntityDetail';
import { expiryState } from './attributeSchema';
import DuplicateSuggestions from './DuplicateSuggestions';
import { DOCUMENT_TYPE, DRAFT_TYPE, ENTITY_TYPES, SHELVES, shelfForType, typeLabel, type Shelf } from './typeCatalog';

// The registry is browsed like a lab: chemicals, reagents, samples, equipment, places. Each
// shelf lists what matters for its kind (structure and MW for a compound, lot and expiry for a
// reagent, organism and storage for a sample) and creates the right kind of thing. Drafts made
// while writing sit on their own shelf until someone says what they are.

type Props = {
  onOpenDocument: (documentId: string) => void;
  // Entity to show on open (e.g. from a linked-entity chip in the editor).
  initialSelectedId?: string | null;
};

const UNSORTED_SHELF: Shelf = { id: 'unsorted', label: 'Needs sorting', hint: 'names written with # that nobody has typed yet', types: [DRAFT_TYPE], create: '' };

type Column = { key: string; label: string; numeric?: boolean; render: (entity: BackendEntityListItem) => ReactNode };

const attribute = (entity: BackendEntityListItem, key: string): string => {
  const value = entity.attributes?.[key];
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return typeof value === 'string' ? value : '';
};

function StructureThumb({ smiles }: { smiles: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    smilesToSvg(smiles, 76, 40)
      .then((image) => {
        if (!cancelled) {
          setSvg(image);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [smiles]);
  return svg ? <span className="registry-structure" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="registry-structure registry-structure-empty" />;
}

const nameColumn = (label = 'Name'): Column => ({
  key: 'label',
  label,
  render: (entity) => (
    <>
      <span className="registry-name">{entity.label}</span>
      {entity.subtype && <span className="faint"> · {entity.subtype}</span>}
      {expiryState(entity.attributes) && (
        <span className={`entity-expiry-badge entity-expiry-${expiryState(entity.attributes)}`}>{expiryState(entity.attributes) === 'expired' ? 'expired' : 'expiring'}</span>
      )}
    </>
  )
});

const refsColumn: Column = { key: 'refs', label: 'Used in', numeric: true, render: (entity) => (entity.mentionCount > 0 ? `${entity.mentionCount} ${entity.mentionCount === 1 ? 'entry' : 'entries'}` : <span className="faint">—</span>) };

const kindColumn: Column = { key: 'kind', label: 'Kind', render: (entity) => <span className={`badge type-badge type-${entity.type}`}>{typeLabel(entity.type)}</span> };

// Where it is: the stored_in relation (from "stored #A in #B" or the popover), else the storage text.
const whereColumn: Column = { key: 'where', label: 'Where', render: (entity) => entity.storedInLabel || attribute(entity, 'storage') };

// Places nest: a box in a freezer in a room. Parents first, children indented under them.
function treeOrder(list: BackendEntityListItem[]): { entity: BackendEntityListItem; depth: number }[] {
  const ids = new Set(list.map((entity) => entity.id));
  const children = new Map<string | null, BackendEntityListItem[]>();
  for (const entity of list) {
    const parent = entity.storedInId && ids.has(entity.storedInId) ? entity.storedInId : null;
    children.set(parent, [...(children.get(parent) ?? []), entity]);
  }
  const out: { entity: BackendEntityListItem; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const entity of children.get(parent) ?? []) {
      if (seen.has(entity.id)) {
        continue;
      }
      seen.add(entity.id);
      out.push({ entity, depth });
      walk(entity.id, depth + 1);
    }
  };
  walk(null, 0);
  list.forEach((entity) => {
    if (!seen.has(entity.id)) {
      out.push({ entity, depth: 0 });
    }
  });
  return out;
}

const COLUMNS: Record<string, Column[]> = {
  chemicals: [
    { key: 'structure', label: '', render: (entity) => (typeof entity.attributes?.smiles === 'string' && entity.attributes.smiles ? <StructureThumb smiles={entity.attributes.smiles} /> : <span className="registry-structure registry-structure-empty" />) },
    nameColumn(),
    kindColumn,
    { key: 'formula', label: 'Formula', render: (entity) => attribute(entity, 'formula') || (entity.type === 'batch' ? attribute(entity, 'batchCode') : '') },
    { key: 'mw', label: 'MW', numeric: true, render: (entity) => attribute(entity, 'molecularWeight') },
    { key: 'cas', label: 'CAS / purity', render: (entity) => attribute(entity, 'casNumber') || (attribute(entity, 'purity') ? `${attribute(entity, 'purity')} %` : '') },
    { key: 'amount', label: 'Stock', render: (entity) => attribute(entity, 'amount') },
    whereColumn,
    refsColumn
  ],
  reagents: [
    nameColumn(),
    { key: 'vendor', label: 'Vendor', render: (entity) => [attribute(entity, 'vendor'), attribute(entity, 'catalogNumber')].filter(Boolean).join(' ') },
    { key: 'lot', label: 'Lot', render: (entity) => attribute(entity, 'lotNumber') },
    { key: 'conc', label: 'Conc.', render: (entity) => attribute(entity, 'concentration') },
    { key: 'amount', label: 'Stock', render: (entity) => attribute(entity, 'amount') },
    { key: 'expiry', label: 'Expiry', render: (entity) => attribute(entity, 'expiry') },
    whereColumn,
    refsColumn
  ],
  samples: [
    nameColumn(),
    kindColumn,
    { key: 'organism', label: 'Organism', render: (entity) => attribute(entity, 'organism') },
    { key: 'condition', label: 'Condition', render: (entity) => [attribute(entity, 'condition'), attribute(entity, 'timepoint')].filter(Boolean).join(' · ') },
    whereColumn,
    { key: 'collected', label: 'Collected', render: (entity) => attribute(entity, 'collectedAt') },
    refsColumn
  ],
  equipment: [
    nameColumn(),
    { key: 'model', label: 'Make / model', render: (entity) => [attribute(entity, 'manufacturer'), attribute(entity, 'model')].filter(Boolean).join(' ') },
    { key: 'location', label: 'Where', render: (entity) => attribute(entity, 'location') },
    { key: 'calibration', label: 'Next calibration', render: (entity) => attribute(entity, 'nextCalibration') },
    refsColumn
  ],
  places: [
    nameColumn(),
    kindColumn,
    { key: 'kind', label: 'What', render: (entity) => attribute(entity, 'kind') || [attribute(entity, 'building'), attribute(entity, 'room')].filter(Boolean).join(' ') },
    { key: 'temperature', label: 'Temperature', render: (entity) => attribute(entity, 'temperature') },
    { key: 'position', label: 'Position', render: (entity) => attribute(entity, 'position') },
    { key: 'barcode', label: 'Barcode', render: (entity) => <span className="registry-barcode">{attribute(entity, 'barcode')}</span> },
    refsColumn
  ],
  unsorted: [nameColumn('Written as'), refsColumn],
  search: [
    nameColumn(),
    kindColumn,
    { key: 'shelf', label: 'Shelf', render: (entity) => shelfForType(entity.type)?.label ?? (entity.type === DRAFT_TYPE ? UNSORTED_SHELF.label : typeLabel(entity.type)) },
    refsColumn
  ]
};

export default function EntityRegistry({ onOpenDocument, initialSelectedId = null }: Props) {
  const [shelfId, setShelfId] = useState<string>(SHELVES[0].id);
  const [queryText, setQueryText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const [entities, setEntities] = useState<BackendEntityListItem[]>([]);
  const [counts, setCounts] = useState<BackendEntityCount[]>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([...ENTITY_TYPES]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState(SHELVES[0].types[0]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyNotice, setClassifyNotice] = useState<string | null>(null);

  const searching = queryText.trim().length > 0;
  const shelf = shelfId === UNSORTED_SHELF.id ? UNSORTED_SHELF : (SHELVES.find((item) => item.id === shelfId) ?? SHELVES[0]);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);

  // Opening an entity from the editor lands on its shelf.
  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const entity = entities.find((item) => item.id === selectedId);
    if (entity && !searching) {
      const target = entity.type === DRAFT_TYPE ? UNSORTED_SHELF.id : shelfForType(entity.type)?.id;
      if (target && target !== shelfId) {
        setShelfId(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const reloadCounts = useCallback(async () => {
    try {
      setCounts(await fetchEntityCounts());
    } catch {
      setCounts([]);
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      let list: BackendEntityListItem[];
      let types: string[] = [];
      if (searching) {
        const result = await fetchEntities({ q: queryText.trim() });
        list = result.entities.filter((entity) => entity.type !== DOCUMENT_TYPE);
        types = result.types;
      } else {
        const results = await Promise.all(shelf.types.map((type) => fetchEntities({ type })));
        list = results.flatMap((result) => result.entities);
        types = results.flatMap((result) => result.types);
        list.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
      }
      setEntities(list);
      setKnownTypes(Array.from(new Set([...ENTITY_TYPES, ...types])).filter((type) => type !== DOCUMENT_TYPE).sort());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load entities');
    }
    void reloadCounts();
  }, [queryText, searching, shelf, reloadCounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 150);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    const onChanged = () => void reload();
    window.addEventListener('labnotes:entities-changed', onChanged);
    return () => window.removeEventListener('labnotes:entities-changed', onChanged);
  }, [reload]);

  const countFor = (types: string[], status?: string) => counts.filter((row) => types.includes(row.type) && (status ? row.status === status : row.status !== 'archived')).reduce((sum, row) => sum + row.count, 0);
  const draftCount = countFor([DRAFT_TYPE]) + counts.filter((row) => row.status === 'draft' && row.type !== DRAFT_TYPE).reduce((sum, row) => sum + row.count, 0);

  const visible = useMemo(() => {
    let list = entities;
    if (!showArchived) {
      list = list.filter((entity) => entity.status !== 'archived');
    }
    if (onlyExpiring) {
      list = list.filter((entity) => expiryState(entity.attributes) !== null);
    }
    return list;
  }, [entities, showArchived, onlyExpiring]);

  const expiringCount = entities.filter((entity) => expiryState(entity.attributes) !== null).length;
  const ordered = useMemo(() => (!searching && shelf.id === 'places' ? treeOrder(visible) : visible.map((entity) => ({ entity, depth: 0 }))), [visible, searching, shelf.id]);
  const columns = COLUMNS[searching ? 'search' : shelf.id] ?? COLUMNS.search;

  // Tokens in open documents colour themselves by the registry's type, so tell them; the
  // listener above reloads this list.
  const notifyChanged = () => window.dispatchEvent(new CustomEvent('labnotes:entities-changed'));

  const startCreate = () => {
    setNewType(shelf.types[0]);
    setNewLabel('');
    setIsCreating(true);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) {
      return;
    }
    try {
      const entity = await createEntity(newType, label);
      setNewLabel('');
      setIsCreating(false);
      notifyChanged();
      setSelectedId(entity.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create entity');
    }
  };

  const handleClassify = async () => {
    setIsClassifying(true);
    setClassifyNotice(null);
    try {
      const result = await classifyEntities();
      const filled = result.classified.length;
      setClassifyNotice(
        result.stopped
          ? `Stopped: ${result.stopped}`
          : filled > 0
            ? `Sorted ${filled} ${filled === 1 ? 'name' : 'names'}${result.missed > 0 ? `; ${result.missed} still need a person` : ''}`
            : 'Nothing could be sorted automatically'
      );
      notifyChanged();
    } catch (classifyError) {
      setClassifyNotice(classifyError instanceof Error ? classifyError.message : 'Classification failed');
    } finally {
      setIsClassifying(false);
    }
  };

  const drafts = entities.filter((entity) => entity.status === 'draft' || entity.type === DRAFT_TYPE);

  return (
    <div className="registry">
      <nav className="registry-rail" aria-label="Shelves">
        <input type="search" className="registry-search" placeholder="Search every shelf" value={queryText} onChange={(event) => setQueryText(event.target.value)} />
        {SHELVES.map((item) => (
          <button key={item.id} type="button" className={`registry-shelf${!searching && shelfId === item.id ? ' is-active' : ''}`} onClick={() => { setShelfId(item.id); setQueryText(''); }} title={item.hint}>
            <span>{item.label}</span>
            <span className="registry-shelf-count">{countFor(item.types)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`registry-shelf registry-shelf-unsorted${!searching && shelfId === UNSORTED_SHELF.id ? ' is-active' : ''}${draftCount > 0 ? ' has-items' : ''}`}
          onClick={() => { setShelfId(UNSORTED_SHELF.id); setQueryText(''); }}
          title={UNSORTED_SHELF.hint}
        >
          <span>{UNSORTED_SHELF.label}</span>
          <span className="registry-shelf-count">{draftCount}</span>
        </button>
      </nav>

      <div className="registry-list">
        <div className="registry-shelf-head">
          <div>
            <h2 className="registry-shelf-title">{searching ? `Results for “${queryText.trim()}”` : shelf.label}</h2>
            <div className="entity-muted registry-shelf-hint">{searching ? `${visible.length} found across all shelves` : shelf.hint}</div>
          </div>
          <div className="registry-shelf-actions">
            {expiringCount > 0 && (
              <label className="registry-toggle">
                <input type="checkbox" checked={onlyExpiring} onChange={(event) => setOnlyExpiring(event.target.checked)} />
                expiring only ({expiringCount})
              </label>
            )}
            <label className="registry-toggle">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              archived
            </label>
            {!searching && shelf.create && (
              <button type="button" className="btn btn-primary" onClick={startCreate}>
                + {shelf.create}
              </button>
            )}
          </div>
        </div>

        {isCreating && (
          <form className="registry-create" onSubmit={(event) => void handleCreate(event)}>
            <input type="text" placeholder="Name, as you would write it in the text" value={newLabel} autoFocus onChange={(event) => setNewLabel(event.target.value)} />
            {shelf.types.length > 1 && (
              <select value={newType} onChange={(event) => setNewType(event.target.value)} aria-label="Kind">
                {shelf.types.map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" disabled={!newLabel.trim()}>
              Create
            </button>
            <button type="button" className="link-button" onClick={() => setIsCreating(false)}>
              cancel
            </button>
          </form>
        )}

        {shelf.id === UNSORTED_SHELF.id && !searching && (
          <div className="registry-drafts">
            <span className="entity-muted">
              {draftCount === 0 ? 'Everything written with # has been sorted.' : `${draftCount} ${draftCount === 1 ? 'name was' : 'names were'} written in the notebook and not sorted yet. Click one to say what it is, or let the classifier try.`}
            </span>
            {draftCount > 0 && (
              <button type="button" className="link-button" disabled={isClassifying} onClick={() => void handleClassify()}>
                {isClassifying ? 'Sorting…' : 'Sort automatically'}
              </button>
            )}
            {classifyNotice && <span className="status-inline">{classifyNotice}</span>}
          </div>
        )}

        {error && <div className="status-inline">{error}</div>}

        {shelf.id === 'chemicals' && !searching && <DuplicateSuggestions onChanged={notifyChanged} onSelect={setSelectedId} />}

        {shelf.id === UNSORTED_SHELF.id && !searching && drafts.length > 0 && <DraftReconciliation drafts={drafts} types={knownTypes} onChanged={notifyChanged} onSelect={setSelectedId} />}

        <table className="registry-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.numeric ? 'is-numeric' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="registry-empty">
                  {searching ? 'Nothing matches' : shelf.create ? `Nothing on this shelf yet. Write #${shelf.types[0] === 'compound' ? 'Aspirin' : 'a name'} in a protocol, or add one here.` : 'Nothing to sort'}
                </td>
              </tr>
            )}
            {ordered.map(({ entity, depth }) => (
              <tr
                key={entity.id}
                className={`registry-row${entity.id === selectedId ? ' is-active' : ''}${entity.status === 'archived' ? ' is-archived' : ''}${entity.status === 'draft' ? ' is-draft' : ''}`}
                onClick={() => setSelectedId(entity.id)}
              >
                {columns.map((column, index) => (
                  <td key={column.key} className={column.numeric ? 'is-numeric' : undefined} style={index === 0 && depth > 0 ? { paddingLeft: `${0.5 + depth * 1.2}rem` } : undefined}>
                    {index === 0 && depth > 0 && <span className="registry-tree-branch">└ </span>}
                    {column.render(entity)}
                  </td>
                ))}
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
            types={knownTypes}
            onChanged={notifyChanged}
            onOpenDocument={onOpenDocument}
            onOpenEntity={setSelectedId}
            onMerged={(targetId) => {
              setSelectedId(targetId);
              void reload();
            }}
          />
        ) : (
          <div className="registry-placeholder">Pick something from the shelf to see its details, where it was used and how much.</div>
        )}
      </div>
    </div>
  );
}
