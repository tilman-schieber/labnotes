import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { fetchSuggestions, registerBatch, searchEntities, type BackendEntitySearchResult, type BackendSuggestion } from '../api/backend';
import { getCurrentUserId } from '../storage/currentUser';
import { EMPTY_CONDITIONS, extractConditions, mergeConditions, type Atmosphere, type ReactionConditions } from '../chemistry/conditions';
import { isCompoundAttributes, smilesToSvg, type CompoundAttributes } from '../chemistry/molecule';
import { COMPONENT_ROLES, computeReaction, createComponent, type ComponentRole, type ReactionComponent } from '../chemistry/reaction';
import { componentsFromBlocks, mergeComponents, sectionBlocksBefore } from '../chemistry/reactionFromText';
import { convert, formatQuantity, parseQuantity, type Quantity } from '../units/quantity';
import { describeGhs, loadEntity } from './extensions/CompoundToken';
import type { ReactionAttrs, ReactionOptions } from './extensions/Reaction';
import SchemeView from './SchemeView';
import { findBoundQuantities, sectionRange } from './textSync';

type Field = 'mass' | 'volume' | 'concentration' | 'actualMass' | 'temperature' | 'time' | 'pressure' | 'stirring';

const FIELD_HINT: Record<Field, string> = {
  mass: 'e.g. 250 mg',
  volume: 'e.g. 2.5 mL',
  concentration: '2 M, 10 mg/mL, 37 wt%',
  actualMass: 'isolated, e.g. 1.8 g',
  temperature: 'e.g. 80 °C',
  time: 'e.g. 4 h',
  pressure: 'e.g. 5 bar',
  stirring: 'e.g. 500 rpm'
};

const ATMOSPHERES: Atmosphere[] = ['N2', 'Ar', 'H2', 'O2', 'CO', 'air'];

// How the reaction was run: chips under the title, each editable, pre-filled from the prose.
function ConditionsLine({ conditions, disabled, onChange }: { conditions: ReactionConditions | null; disabled: boolean; onChange: (next: ReactionConditions) => void }) {
  const current = conditions ?? EMPTY_CONDITIONS;
  const set = (changes: Partial<ReactionConditions>) => onChange({ ...current, ...changes });
  const [notes, setNotes] = useState(current.notes.join(', '));
  useEffect(() => {
    setNotes(current.notes.join(', '));
  }, [current.notes.join(', ')]);

  return (
    <div className="reaction-conditions">
      <span className="reaction-conditions-label">Conditions</span>
      <QuantityInput value={current.temperature} field="temperature" disabled={disabled} onChange={(value) => set({ temperature: value })} />
      <select className="reaction-input" value={current.temperatureLabel ?? ''} disabled={disabled} onChange={(event) => set({ temperatureLabel: (event.target.value || null) as ReactionConditions['temperatureLabel'] })} title="Temperature written without a number">
        <option value="">—</option>
        <option value="rt">rt</option>
        <option value="reflux">reflux</option>
      </select>
      <QuantityInput value={current.time} field="time" disabled={disabled} onChange={(value) => set({ time: value })} />
      <select className="reaction-input" value={current.atmosphere ?? ''} disabled={disabled} onChange={(event) => set({ atmosphere: (event.target.value || null) as Atmosphere | null })} title="Atmosphere">
        <option value="">atmosphere</option>
        {ATMOSPHERES.map((atmosphere) => (
          <option key={atmosphere} value={atmosphere}>
            {atmosphere === 'air' ? 'air' : `under ${atmosphere}`}
          </option>
        ))}
      </select>
      <QuantityInput value={current.pressure} field="pressure" disabled={disabled} onChange={(value) => set({ pressure: value })} />
      <QuantityInput value={current.stirring} field="stirring" disabled={disabled} onChange={(value) => set({ stirring: value })} />
      <input
        type="text"
        className="reaction-input reaction-input-notes"
        value={notes}
        placeholder="notes: dropwise, overnight, …"
        disabled={disabled}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => set({ notes: notes.split(',').map((note) => note.trim()).filter(Boolean) })}
      />
    </div>
  );
}

function QuantityInput({
  value,
  field,
  disabled,
  onChange
}: {
  value: Quantity | null;
  field: Field;
  disabled: boolean;
  onChange: (next: Quantity | null) => void;
}) {
  const [text, setText] = useState(value ? formatQuantity(value) : '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value ? formatQuantity(value) : '');
    setInvalid(false);
  }, [value]);

  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const parsed = parseQuantity(text);
    setInvalid(!parsed);
    if (parsed) {
      onChange(parsed);
    }
  };

  return (
    <input
      type="text"
      className={`reaction-input${invalid ? ' is-invalid' : ''}`}
      value={text}
      placeholder={FIELD_HINT[field]}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function NumberInput({
  value,
  placeholder,
  disabled,
  step,
  onChange
}: {
  value: number | null;
  placeholder?: string;
  disabled: boolean;
  step?: string;
  onChange: (next: number | null) => void;
}) {
  return (
    <input
      type="number"
      className="reaction-input reaction-input-number"
      value={value ?? ''}
      placeholder={placeholder}
      step={step ?? 'any'}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    />
  );
}

// Compound picker: free text label, or pick a registry compound to link it and pull its MW.
function CompoundCell({
  component,
  disabled,
  onChange
}: {
  component: ReactionComponent;
  disabled: boolean;
  onChange: (patch: Partial<ReactionComponent>) => void;
}) {
  const [query, setQuery] = useState(component.label);
  const [results, setResults] = useState<BackendEntitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [hazard, setHazard] = useState<{ text: string; level: string } | null>(null);

  useEffect(() => {
    if (!component.entityId) {
      setHazard(null);
      return;
    }
    let cancelled = false;
    loadEntity(component.entityId)
      .then((entity) => {
        if (!cancelled) {
          setHazard(describeGhs(entity?.attributes as Record<string, unknown> | undefined));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [component.entityId]);

  useEffect(() => {
    setQuery(component.label);
  }, [component.label]);

  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchEntities(query, { type: ['compound', 'batch'] })
        .then((items) => {
          if (!cancelled) {
            setResults(items);
          }
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, isOpen]);

  // The structure thumbnail comes from the hydrated SMILES (see `hydrateComponents` in the block).
  useEffect(() => {
    if (!component.smiles) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    smilesToSvg(component.smiles, 90, 50)
      .then((image) => {
        if (!cancelled) {
          setSvg(image);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [component.smiles]);

  const pick = async (result: BackendEntitySearchResult) => {
    setIsOpen(false);
    // A batch row points at the compound (for MW and structure) and remembers which lot was used.
    const isBatch = result.type === 'batch';
    const compoundId = isBatch ? result.parentId ?? null : result.id;
    const entity = compoundId ? await loadEntity(compoundId) : null;
    const attributes = entity && isCompoundAttributes(entity.attributes) ? (entity.attributes as CompoundAttributes) : null;
    onChange({
      entityId: compoundId,
      batchId: isBatch ? result.id : null,
      batchCode: isBatch ? result.batchCode ?? result.label : null,
      label: isBatch ? result.parentLabel ?? result.label : result.label,
      molecularWeight: attributes?.molecularWeight ?? component.molecularWeight,
      smiles: attributes?.smiles ?? result.smiles ?? null,
      density: component.density ?? registryDensity(entity?.attributes)
    });
  };

  return (
    <div className="reaction-compound">
      {svg && <span className="reaction-compound-svg" dangerouslySetInnerHTML={{ __html: svg }} />}
      <div className="reaction-compound-picker">
        <input
          type="text"
          className={`reaction-input${component.entityId ? ' is-linked' : ''}`}
          value={query}
          placeholder="compound"
          disabled={disabled}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 150);
            if (query !== component.label) {
              onChange({ label: query, entityId: null, batchId: null, batchCode: null, smiles: null });
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
        />
        {component.batchCode && (
          <span className="reaction-batch-chip" title="The batch (lot) used in this row">
            {component.batchCode}
          </span>
        )}
        {hazard && (
          <span className={`reaction-hazard hazard-${hazard.level}`} title={hazard.text}>
            {hazard.text.split(' · ')[0]}
          </span>
        )}
        {isOpen && results.length > 0 && (
          <div className="reaction-picker-list">
            {results.map((result) => (
              <div key={result.id} className="mention-item" onMouseDown={(event) => { event.preventDefault(); void pick(result); }}>
                <div className="mention-item-label">{result.label}</div>
                <div className="mention-item-meta">{result.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The registry's density attribute for a compound, when it is a usable number.
function registryDensity(attributes: unknown): number | null {
  const value = attributes && typeof attributes === 'object' ? (attributes as Record<string, unknown>).density : null;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

// Rows that know their entity but not yet what the registry knows about it.
function needsHydration(component: ReactionComponent): boolean {
  return Boolean(component.entityId) && (component.molecularWeight === null || component.smiles === undefined || component.density === null);
}

export default function ReactionBlockView({ node, updateAttributes, editor, selected, getPos, extension }: NodeViewProps) {
  const attrs = node.attrs as ReactionAttrs;
  const documentId = (extension.options as ReactionOptions).documentId;
  const disabled = !editor.isEditable;
  const [batchError, setBatchError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  // Suggestions from the server's provider (none unless one is configured), fetched after saves.
  const [suggestions, setSuggestions] = useState<BackendSuggestion[]>([]);
  useEffect(() => {
    if (!documentId) {
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchSuggestions(documentId)
        .then((items) => {
          if (cancelled) {
            return;
          }
          const position = typeof getPos === 'function' ? getPos() : null;
          const blockIndex = position === null || position === undefined ? null : editor.state.doc.resolve(position).index(0);
          setSuggestions(items.filter((item) => !item.target || item.target.blockIndex === undefined || item.target.blockIndex === blockIndex));
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener('labnotes:document-saved', load);
    return () => {
      cancelled = true;
      window.removeEventListener('labnotes:document-saved', load);
    };
  }, [documentId]);
  const applySuggestion = (suggestion: BackendSuggestion) => {
    if (suggestion.patch && suggestion.target?.componentId) {
      patch(suggestion.target.componentId, suggestion.patch as Partial<ReactionComponent>);
    }
    setSuggestions((previous) => previous.filter((item) => item !== suggestion));
  };
  const summary = useMemo(() => computeReaction(attrs.components), [attrs.components]);
  const limitingGroup = useId();
  const collapsed = Boolean(attrs.collapsed);
  // One line that says what the table would: limiting reagent and, for each product, the yield.
  const summaryLine = useMemo(() => {
    const products = summary.components.filter((component) => component.role === 'product');
    const parts = products.map((product) => {
      const name = product.label || 'product';
      if (product.yieldPercent !== null) {
        return `${name} ${product.actualMass ? formatQuantity(product.actualMass) : ''} (${product.yieldPercent}%)`.replace('  ', ' ');
      }
      if (product.theoreticalMass) {
        return `${name} theor. ${formatQuantity(product.theoreticalMass)}`;
      }
      return name;
    });
    const count = attrs.components.length;
    return [`${count} ${count === 1 ? 'row' : 'rows'}`, ...parts].join(' · ');
  }, [summary, attrs.components.length]);
  // Bumped when the registry changes (a draft got classified, a compound was edited) so linked
  // rows pick up the MW they were missing.
  const [registryTick, setRegistryTick] = useState(0);
  useEffect(() => {
    const bump = () => setRegistryTick((tick) => tick + 1);
    window.addEventListener('labnotes:entities-changed', bump);
    return () => window.removeEventListener('labnotes:entities-changed', bump);
  }, []);

  // The React prop `node` lags the document by a render, so anything that derives a new list from
  // the old one reads the live node: two patches in one tick would otherwise drop each other.
  const currentComponents = (): ReactionComponent[] => {
    const position = typeof getPos === 'function' ? getPos() : null;
    const live = position === null || position === undefined ? null : editor.state.doc.nodeAt(position);
    const components = live?.type.name === 'reaction' ? (live.attrs as ReactionAttrs).components : null;
    return components ?? attrs.components;
  };
  const setComponents = (components: ReactionComponent[]) => updateAttributes({ components });
  const patch = (id: string, changes: Partial<ReactionComponent>) =>
    setComponents(currentComponents().map((component) => (component.id === id ? { ...component, ...changes } : component)));

  // Fill MW, structure and density from the registry for linked rows that lack them — rows read
  // from prose, rows merged by "↻ from text", and rows whose draft entity was classified since.
  // One update for all rows, so concurrent fills cannot overwrite each other.
  useEffect(() => {
    const pending = attrs.components.filter(needsHydration);
    if (pending.length === 0) {
      return;
    }
    let cancelled = false;
    Promise.all(
      pending.map(async (component) => {
        const entity = await loadEntity(component.entityId as string).catch(() => null);
        const attributes = entity && isCompoundAttributes(entity.attributes) ? (entity.attributes as CompoundAttributes) : null;
        const solvent = Boolean(entity?.attributes && (entity.attributes as Record<string, unknown>).solvent === true);
        return { id: component.id, attributes, density: registryDensity(entity?.attributes), solvent };
      })
    ).then((results) => {
      if (cancelled) {
        return;
      }
      const byId = new Map(results.map((result) => [result.id, result]));
      let changed = false;
      const next = currentComponents().map((component) => {
        const result = byId.get(component.id);
        if (!result) {
          return component;
        }
        const update: Partial<ReactionComponent> = {};
        if (component.molecularWeight === null && result.attributes?.molecularWeight) {
          update.molecularWeight = result.attributes.molecularWeight;
        }
        if (component.smiles !== (result.attributes?.smiles ?? null)) {
          update.smiles = result.attributes?.smiles ?? null;
        }
        if (component.density === null && result.density !== null) {
          update.density = result.density;
        }
        // A registry solvent measured by volume with no equivalents was read as a reactant only
        // because the sentence gave no better clue; the registry does.
        if (result.solvent && component.role === 'reactant' && component.roleSource !== 'user' && component.volume && !component.mass && component.equivalents === null) {
          update.role = 'solvent';
        }
        if (Object.keys(update).length === 0) {
          return component;
        }
        changed = true;
        return { ...component, ...update };
      });
      if (changed) {
        setComponents(next);
      }
    });
    return () => {
      cancelled = true;
    };
    // Keyed on what can be hydrated, not on every keystroke in the table.
  }, [registryTick, attrs.components.map((component) => `${component.id}:${component.entityId}:${component.molecularWeight}:${component.smiles ?? '?'}`).join('|')]);

  // Re-read the section above this block and fold new entities/amounts into the table.
  const refreshFromText = () => {
    const position = typeof getPos === 'function' ? getPos() : null;
    if (position === null || position === undefined) {
      return;
    }
    const blocks = editor.state.doc.toJSON().content ?? [];
    const blockIndex = editor.state.doc.resolve(position).index(0);
    const section = sectionBlocksBefore(blocks, blockIndex);
    updateAttributes({
      components: mergeComponents(currentComponents(), componentsFromBlocks(section)),
      conditions: mergeConditions(attrs.conditions, extractConditions(section))
    });
  };

  // An amount edited in the table is written back to the sentence it was read from, when the
  // prose above still carries an amount of that dimension bound to the same entity.
  const writeBack = (component: ReactionComponent, dimension: 'mass' | 'volume' | 'concentration', value: Quantity | null) => {
    const position = typeof getPos === 'function' ? getPos() : null;
    if (!component.entityId || !value || position === null || position === undefined) {
      return;
    }
    const { doc } = editor.state;
    const { from, to } = sectionRange(doc, doc.resolve(position).index(0));
    const target = (findBoundQuantities(doc, from, to).get(component.entityId) ?? []).find((item) => item.dimension === dimension);
    const node = target ? doc.nodeAt(target.pos) : null;
    if (!target || !node || node.type.name !== 'quantity' || (node.attrs.value === value.value && node.attrs.unit === value.unit)) {
      return;
    }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, undefined, { value: value.value, unit: value.unit }));
  };
  const patchAmount = (component: ReactionComponent, field: 'mass' | 'volume' | 'concentration' | 'actualMass', value: Quantity | null) => {
    patch(component.id, { [field]: value });
    writeBack(component, field === 'actualMass' ? 'mass' : field, value);
  };
  // A product with an isolated mass becomes a batch: TS-012-A, the lot this experiment made,
  // linked to the compound and to the batches consumed in the table.
  const register = async (component: ReactionComponent) => {
    if (!documentId || !component.entityId || !component.actualMass) {
      return;
    }
    setBatchError(null);
    setRegistering(component.id);
    try {
      const reactantBatchIds = currentComponents()
        .filter((row) => row.role !== 'product' && row.batchId)
        .map((row) => row.batchId as string);
      const batch = await registerBatch(component.entityId, {
        documentId,
        userId: getCurrentUserId(),
        amount: formatQuantity(component.actualMass),
        purity: component.purity ?? null,
        reactantBatchIds
      });
      patch(component.id, { batchId: batch.id, batchCode: batch.label });
      window.dispatchEvent(new CustomEvent('labnotes:entities-changed'));
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Could not register the batch');
    } finally {
      setRegistering(null);
    }
  };

  // Analytics on the batch go into the text right after the table, so they are signed with it.
  const addAnalytics = (component: ReactionComponent) => {
    const position = typeof getPos === 'function' ? getPos() : null;
    if (position === null || position === undefined || !component.batchId) {
      return;
    }
    editor.chain().focus().insertAnalytics({ batchId: component.batchId, batchCode: component.batchCode ?? null }, position + node.nodeSize).run();
  };

  const remove = (id: string) => setComponents(currentComponents().filter((component) => component.id !== id));
  const add = (role: ComponentRole) => setComponents([...currentComponents(), createComponent(role)]);
  const setLimiting = (id: string) => setComponents(currentComponents().map((component) => ({ ...component, limiting: component.id === id })));

  return (
    <NodeViewWrapper className={`reaction-block${selected ? ' is-selected' : ''}`} data-drag-handle>
      <div className="reaction-header">
        <input
          type="text"
          className="reaction-title"
          value={attrs.title}
          placeholder="Reaction"
          disabled={disabled}
          onChange={(event) => updateAttributes({ title: event.target.value })}
        />
        {summary.limitingId && (
          <span className="entity-muted">
            limiting: {summary.components.find((component) => component.id === summary.limitingId)?.label || '—'}
            {summary.limitingRule === 'lowest' && <span className="reaction-limiting-rule" title="The reactant with the fewest equivalents; mark another with “lim.” to override"> (fewest equiv)</span>}
          </span>
        )}
        {!disabled && !collapsed && (
          <button type="button" className="reaction-refresh" onClick={refreshFromText} title="Add entities and amounts written in the text above">
            ↻ from text
          </button>
        )}
        <button
          type="button"
          className="reaction-collapse"
          onClick={() => updateAttributes({ collapsed: !collapsed })}
          title={collapsed ? 'Show the stoichiometry table' : 'Hide the stoichiometry table'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▸ table' : '▾ table'}
        </button>
      </div>

      {(!disabled || attrs.scheme || attrs.components.some((component) => component.smiles)) && (
        <SchemeView components={attrs.components} conditions={attrs.conditions} scheme={attrs.scheme ?? null} disabled={disabled} onChange={(scheme) => updateAttributes({ scheme })} />
      )}

      {(!disabled || attrs.conditions) && (
        <ConditionsLine conditions={attrs.conditions} disabled={disabled} onChange={(conditions) => updateAttributes({ conditions })} />
      )}

      {collapsed && (
        <div className="reaction-summary-line">
          {summaryLine}
          {summary.warnings.length > 0 && <span className="reaction-summary-warning"> · {summary.warnings.length} {summary.warnings.length === 1 ? 'warning' : 'warnings'}</span>}
        </div>
      )}

      {!collapsed && (<>
      <div className="reaction-table-wrap">
        <table className="reaction-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Compound</th>
              <th>MW</th>
              <th>Equiv</th>
              <th>mmol</th>
              <th>Mass</th>
              <th>Volume</th>
              <th>Conc. / density / purity</th>
              <th>Yield</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {summary.components.map((component) => {
              const isProduct = component.role === 'product';
              const hasWarning = summary.warnings.some((warning) => warning.componentId === component.id);
              return (
                <tr key={component.id} className={`reaction-row role-${component.role}${component.isLimiting ? ' is-limiting' : ''}${hasWarning ? ' has-warning' : ''}`}>
                  <td>
                    <select
                      className="reaction-input"
                      value={component.role}
                      disabled={disabled}
                      onChange={(event) => patch(component.id, { role: event.target.value as ComponentRole, roleSource: 'user' })}
                    >
                      {COMPONENT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    {component.role === 'reactant' && (
                      <label className="reaction-limiting" title="Limiting reagent">
                        <input type="radio" name={limitingGroup} checked={component.isLimiting} disabled={disabled} onChange={() => setLimiting(component.id)} />
                        lim.
                      </label>
                    )}
                  </td>
                  <td>
                    <CompoundCell component={component} disabled={disabled} onChange={(changes) => patch(component.id, changes)} />
                    {component.source?.sentence && (
                      <span className="reaction-source" title={`Read from: “${component.source.sentence}”`}>
                        ¶ from text
                      </span>
                    )}
                  </td>
                  <td>
                    <NumberInput value={component.molecularWeight} placeholder="g/mol" disabled={disabled} onChange={(value) => patch(component.id, { molecularWeight: value })} />
                  </td>
                  <td>
                    <NumberInput value={component.equivalents} placeholder={component.computedEquivalents?.toString() ?? 'equiv'} disabled={disabled} onChange={(value) => patch(component.id, { equivalents: value })} />
                    {component.computedEquivalents !== null && component.computedEquivalents !== component.equivalents && (
                      <div className="reaction-derived">= {component.computedEquivalents}</div>
                    )}
                  </td>
                  <td className="reaction-derived-cell">
                    {component.amountMmol ?? '—'}
                    {component.amount && component.amountMmol !== null && Math.abs(convert(component.amount, 'mmol').value - component.amountMmol) > 1e-6 && (
                      <div className="reaction-derived" title="Stated in the text">text: {formatQuantity(component.amount)}</div>
                    )}
                  </td>
                  <td>
                    {isProduct ? (
                      <div className="reaction-derived">theor. {component.theoreticalMass ? formatQuantity(component.theoreticalMass) : '—'}</div>
                    ) : (
                      <>
                        <QuantityInput value={component.mass} field="mass" disabled={disabled} onChange={(value) => patchAmount(component, 'mass', value)} />
                        {component.computedMass && !component.mass && <div className="reaction-derived">need {formatQuantity(component.computedMass)}</div>}
                      </>
                    )}
                  </td>
                  <td>
                    {!isProduct && (
                      <QuantityInput value={component.volume} field="volume" disabled={disabled} onChange={(value) => patchAmount(component, 'volume', value)} />
                    )}
                  </td>
                  <td>
                    {!isProduct && (
                      <div className="reaction-stack">
                        <QuantityInput value={component.concentration} field="concentration" disabled={disabled} onChange={(value) => patchAmount(component, 'concentration', value)} />
                        <NumberInput value={component.density} placeholder="d g/mL" disabled={disabled} onChange={(value) => patch(component.id, { density: value })} />
                        <NumberInput value={component.purity ?? null} placeholder="purity %" disabled={disabled} onChange={(value) => patch(component.id, { purity: value })} />
                      </div>
                    )}
                  </td>
                  <td>
                    {isProduct && (
                      <div className="reaction-stack">
                        <QuantityInput value={component.actualMass} field="actualMass" disabled={disabled} onChange={(value) => patchAmount(component, 'actualMass', value)} />
                        <div className="reaction-derived">
                          {component.yieldPercent !== null ? `${component.yieldPercent}%` : '—'}
                          {component.actualMmol !== null && ` · ${component.actualMmol} mmol`}
                        </div>
                        {!disabled && component.entityId && component.actualMass && !component.batchId && documentId && (
                          <button type="button" className="link-button reaction-register" disabled={registering === component.id} onClick={() => void register(component)} title="Register this material as a batch (lot) of the compound, coded after this experiment">
                            {registering === component.id ? 'Registering…' : 'Register batch'}
                          </button>
                        )}
                        {component.batchId && (
                          <div className="reaction-batch-line">
                            <span className="reaction-batch-chip" title="Registered batch">{component.batchCode}</span>
                            {!disabled && (
                              <button type="button" className="link-button" onClick={() => addAnalytics(component)} title="Add an analytics block (TLC, NMR, MS …) for this batch below the table">
                                + analytics
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <button type="button" className="link-button" disabled={disabled} onClick={() => remove(component.id)} aria-label="Remove row">
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {batchError && <div className="entity-error">{batchError}</div>}

      {suggestions.length > 0 && (
        <ul className="reaction-suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.provider}-${index}`}>
              <span className="reaction-suggestion-kind">{suggestion.kind}</span> {suggestion.message}
              {!disabled && suggestion.patch && suggestion.target?.componentId && (
                <button type="button" className="link-button" onClick={() => applySuggestion(suggestion)}>
                  Apply
                </button>
              )}
              <span className="entity-muted"> · {suggestion.provider}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.warnings.length > 0 && (
        <ul className="reaction-warnings">
          {summary.warnings.map((warning, index) => (
            <li key={`${warning.componentId ?? 'table'}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="reaction-actions">
          {COMPONENT_ROLES.map((role) => (
            <button key={role} type="button" onClick={() => add(role)}>
              + {role}
            </button>
          ))}
        </div>
      )}
      </>)}
    </NodeViewWrapper>
  );
}
