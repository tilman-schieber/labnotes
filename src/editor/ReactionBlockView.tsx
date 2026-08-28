import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';
import { searchEntities, type BackendEntitySearchResult } from '../api/backend';
import { isCompoundAttributes, smilesToSvg, type CompoundAttributes } from '../chemistry/molecule';
import { COMPONENT_ROLES, computeReaction, createComponent, type ComponentRole, type ReactionComponent } from '../chemistry/reaction';
import { formatQuantity, parseQuantity, type Quantity } from '../units/quantity';
import { loadEntity } from './extensions/CompoundToken';
import type { ReactionAttrs } from './extensions/Reaction';

type Field = 'mass' | 'volume' | 'concentration' | 'actualMass';

const FIELD_HINT: Record<Field, string> = {
  mass: 'e.g. 250 mg',
  volume: 'e.g. 2.5 mL',
  concentration: 'e.g. 2 M',
  actualMass: 'isolated, e.g. 1.8 g'
};

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
      searchEntities(query, { type: 'compound' })
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

  useEffect(() => {
    if (!component.entityId) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    loadEntity(component.entityId)
      .then((entity) => {
        const attributes = entity && isCompoundAttributes(entity.attributes) ? (entity.attributes as CompoundAttributes) : null;
        return attributes?.smiles ? smilesToSvg(attributes.smiles, 90, 50) : null;
      })
      .then((image) => {
        if (!cancelled) {
          setSvg(image);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [component.entityId]);

  const pick = async (result: BackendEntitySearchResult) => {
    setIsOpen(false);
    const entity = await loadEntity(result.id);
    const attributes = entity && isCompoundAttributes(entity.attributes) ? (entity.attributes as CompoundAttributes) : null;
    onChange({
      entityId: result.id,
      label: result.label,
      molecularWeight: attributes?.molecularWeight ?? component.molecularWeight
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
              onChange({ label: query, entityId: null });
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
        />
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

export default function ReactionBlockView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const attrs = node.attrs as ReactionAttrs;
  const disabled = !editor.isEditable;
  const summary = useMemo(() => computeReaction(attrs.components), [attrs.components]);

  const setComponents = (components: ReactionComponent[]) => updateAttributes({ components });
  const patch = (id: string, changes: Partial<ReactionComponent>) =>
    setComponents(attrs.components.map((component) => (component.id === id ? { ...component, ...changes } : component)));
  const remove = (id: string) => setComponents(attrs.components.filter((component) => component.id !== id));
  const add = (role: ComponentRole) => setComponents([...attrs.components, createComponent(role)]);
  const setLimiting = (id: string) => setComponents(attrs.components.map((component) => ({ ...component, limiting: component.id === id })));

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
          </span>
        )}
      </div>

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
              <th>Conc. / density</th>
              <th>Yield</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {summary.components.map((component) => {
              const isProduct = component.role === 'product';
              return (
                <tr key={component.id} className={`reaction-row role-${component.role}${component.isLimiting ? ' is-limiting' : ''}`}>
                  <td>
                    <select
                      className="reaction-input"
                      value={component.role}
                      disabled={disabled}
                      onChange={(event) => patch(component.id, { role: event.target.value as ComponentRole })}
                    >
                      {COMPONENT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    {component.role === 'reactant' && (
                      <label className="reaction-limiting" title="Limiting reagent">
                        <input type="radio" name={`limiting-${node.attrs.title}`} checked={component.isLimiting} disabled={disabled} onChange={() => setLimiting(component.id)} />
                        lim.
                      </label>
                    )}
                  </td>
                  <td>
                    <CompoundCell component={component} disabled={disabled} onChange={(changes) => patch(component.id, changes)} />
                  </td>
                  <td>
                    <NumberInput value={component.molecularWeight} placeholder="g/mol" disabled={disabled} onChange={(value) => patch(component.id, { molecularWeight: value })} />
                  </td>
                  <td>
                    <NumberInput value={component.equivalents} placeholder={component.computedEquivalents?.toString() ?? 'eq'} disabled={disabled} onChange={(value) => patch(component.id, { equivalents: value })} />
                    {component.computedEquivalents !== null && component.computedEquivalents !== component.equivalents && (
                      <div className="reaction-derived">= {component.computedEquivalents}</div>
                    )}
                  </td>
                  <td className="reaction-derived-cell">{component.amountMmol ?? '—'}</td>
                  <td>
                    {isProduct ? (
                      <div className="reaction-derived">theor. {component.theoreticalMass ? formatQuantity(component.theoreticalMass) : '—'}</div>
                    ) : (
                      <>
                        <QuantityInput value={component.mass} field="mass" disabled={disabled} onChange={(value) => patch(component.id, { mass: value })} />
                        {component.computedMass && !component.mass && <div className="reaction-derived">need {formatQuantity(component.computedMass)}</div>}
                      </>
                    )}
                  </td>
                  <td>
                    {!isProduct && (
                      <QuantityInput value={component.volume} field="volume" disabled={disabled} onChange={(value) => patch(component.id, { volume: value })} />
                    )}
                  </td>
                  <td>
                    {!isProduct && (
                      <div className="reaction-stack">
                        <QuantityInput value={component.concentration} field="concentration" disabled={disabled} onChange={(value) => patch(component.id, { concentration: value })} />
                        <NumberInput value={component.density} placeholder="d g/mL" disabled={disabled} onChange={(value) => patch(component.id, { density: value })} />
                      </div>
                    )}
                  </td>
                  <td>
                    {isProduct && (
                      <div className="reaction-stack">
                        <QuantityInput value={component.actualMass} field="actualMass" disabled={disabled} onChange={(value) => patch(component.id, { actualMass: value })} />
                        <div className="reaction-derived">{component.yieldPercent !== null ? `${component.yieldPercent}%` : '—'}</div>
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

      {!disabled && (
        <div className="reaction-actions">
          {COMPONENT_ROLES.map((role) => (
            <button key={role} type="button" onClick={() => add(role)}>
              + {role}
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}
