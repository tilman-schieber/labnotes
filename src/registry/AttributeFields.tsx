import { useMemo } from 'react';
import { ATTRIBUTE_SCHEMA, MANAGED_KEYS, type AttributeField } from './attributeSchema';

type Props = {
  type: string;
  attributes: Record<string, unknown>;
  onChange: (attributes: Record<string, unknown>) => void;
  disabled?: boolean;
};

function fieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function parseField(field: AttributeField, text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  if (field.kind === 'number') {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : undefined;
  }
  return trimmed;
}

// Structured inputs for the known attributes of a type; other keys are left for the JSON editor.
export default function AttributeFields({ type, attributes, onChange, disabled }: Props) {
  const fields = ATTRIBUTE_SCHEMA[type] ?? [];
  const extraKeys = useMemo(
    () => Object.keys(attributes).filter((key) => !fields.some((field) => field.key === key) && !MANAGED_KEYS.has(key)),
    [attributes, fields]
  );

  if (fields.length === 0) {
    return null;
  }

  const update = (field: AttributeField, text: string) => {
    const next = { ...attributes };
    const value = parseField(field, text);
    if (value === undefined) {
      delete next[field.key];
    } else {
      next[field.key] = value;
    }
    onChange(next);
  };

  return (
    <div className="attribute-fields">
      {fields.map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
            step={field.kind === 'number' ? 'any' : undefined}
            value={fieldValue(attributes[field.key])}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(event) => update(field, event.target.value)}
          />
        </label>
      ))}
      {extraKeys.length > 0 && <div className="entity-muted attribute-extra">Other keys ({extraKeys.join(', ')}) are editable in the JSON below.</div>}
    </div>
  );
}
