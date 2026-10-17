import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { searchEntities, type BackendEntitySearchResult } from '../api/backend';
import { formatExperimentNumber } from '../chemistry/batchCode';
import type { NotebookDB } from '../storage/documentStore';
import { IconAtom, IconBeaker, IconFolder, IconLayers } from './icons';

export type PaletteAction = { id: string; label: string; hint?: string; run: () => void; disabled?: boolean };

type Props = {
  db: NotebookDB;
  actions: PaletteAction[];
  onOpenDocument: (documentId: string) => void;
  onOpenEntity: (entityId: string) => void;
  onClose: () => void;
};

type Row = { key: string; icon: ReactNode; label: string; meta: string; run: () => void };

function normalise(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Every word of the query must occur in the haystack; cheap and predictable.
function matches(query: string, haystack: string): boolean {
  const target = normalise(haystack);
  return normalise(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => target.includes(word));
}

// Ctrl/Cmd+K: jump to a document or an entity, or run an action, from the keyboard.
export default function CommandPalette({ db, actions, onOpenDocument, onOpenEntity, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [entities, setEntities] = useState<BackendEntitySearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setEntities([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchEntities(trimmed)
        .then((items) => {
          if (!cancelled) {
            setEntities(items.filter((item) => !item.documentId).slice(0, 6));
          }
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    const projectName = (id: string) => db.projects.find((project) => project.id === id)?.name ?? '';
    const experiments = db.experiments
      .filter((experiment) => !trimmed || matches(trimmed, `${experiment.metadata.number ? formatExperimentNumber(experiment.metadata.number) : ''} ${experiment.title} ${projectName(experiment.projectId)}`))
      .slice(0, trimmed ? 8 : 6)
      .map<Row>((experiment) => ({
        key: `doc-${experiment.id}`,
        icon: <IconBeaker size={14} />,
        label: `${experiment.metadata.number ? `${formatExperimentNumber(experiment.metadata.number)} · ` : ''}${experiment.title}`,
        meta: projectName(experiment.projectId),
        run: () => onOpenDocument(experiment.id)
      }));
    const projects = db.projects
      .filter((project) => trimmed && matches(trimmed, project.name))
      .slice(0, 4)
      .map<Row>((project) => ({ key: `doc-${project.id}`, icon: <IconLayers size={14} />, label: project.name, meta: 'project', run: () => onOpenDocument(project.id) }));
    const groups = db.groups
      .filter((group) => trimmed && matches(trimmed, group.name))
      .slice(0, 3)
      .map<Row>((group) => ({ key: `doc-${group.id}`, icon: <IconFolder size={14} />, label: group.name, meta: 'group', run: () => onOpenDocument(group.id) }));
    const entityRows = entities.map<Row>((entity) => ({
      key: `entity-${entity.id}`,
      icon: <IconAtom size={14} />,
      label: entity.label,
      meta: entity.description ?? entity.type,
      run: () => onOpenEntity(entity.id)
    }));
    const actionRows = actions
      .filter((action) => !action.disabled && (!trimmed || matches(trimmed, action.label)))
      .map<Row>((action) => ({ key: `action-${action.id}`, icon: <span className="palette-action-mark">›</span>, label: action.label, meta: action.hint ?? 'action', run: action.run }));
    return [...actionRows.slice(0, trimmed ? 4 : 3), ...experiments, ...projects, ...groups, ...entityRows];
  }, [query, db, entities, actions, onOpenDocument, onOpenEntity]);

  useEffect(() => {
    setSelected(0);
  }, [query, rows.length]);

  const run = (row: Row | undefined) => {
    if (!row) {
      return;
    }
    onClose();
    row.run();
  };

  return createPortal(
    <div className="modal-backdrop modal-backdrop-top" onMouseDown={onClose}>
      <div className="modal palette" role="dialog" aria-label="Jump to" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="palette-input"
          placeholder="Jump to an experiment, project or entity, or run an action…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((index) => (rows.length ? (index + 1) % rows.length : 0));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((index) => (rows.length ? (index - 1 + rows.length) % rows.length : 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(rows[selected]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {rows.length === 0 && <div className="mention-item mention-item-empty">No matches</div>}
          {rows.map((row, index) => (
            <div
              key={row.key}
              className={`mention-item palette-row${index === selected ? ' is-selected' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                run(row);
              }}
            >
              <span className="palette-icon">{row.icon}</span>
              <span className="mention-item-label">{row.label}</span>
              <span className="mention-item-meta">{row.meta}</span>
            </div>
          ))}
        </div>
        <div className="palette-hint">↑↓ move · Enter open · Esc close</div>
      </div>
    </div>,
    document.body
  );
}
