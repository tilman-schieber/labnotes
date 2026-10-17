// Small builders for notebook content, so a fixture reads like the page it produces.
//
//   doc(h1('Title'), p('Add ', q(25, 'mg'), ' of ', ref(compound), ' …'))
//
// Entities are passed as the objects of the dataset ({ id, label, type }); quantities are
// value + unit; everything else is text.

export const text = (value) => ({ type: 'text', text: value });

export const ref = (entity) => ({
  type: 'entityMention',
  attrs: { id: entity.id, label: entity.label, refType: 'entity', entityType: entity.type, inlineStructure: false, mentionSuggestionChar: '#' }
});

export const user = (person) => ({ type: 'userMention', attrs: { id: person.id, label: person.displayName, refType: 'user' } });

export const q = (value, unit, planned = null) => ({ type: 'quantity', attrs: { value, unit, ...(planned ? { planned } : {}) } });

// A quantity that was planned at `plannedValue` and is now `value` (template or clone instance).
export const qPlanned = (plannedValue, value, unit) => q(value, unit, { value: plannedValue, unit });

export const blank = (label) => ({ type: 'blank', attrs: { label } });

export const stamp = (isoDate, hhmm) => ({ type: 'timestamp', attrs: { at: `${isoDate}T${hhmm}:00+02:00` } });

const inline = (parts) => parts.map((part) => (typeof part === 'string' ? text(part) : part));

export const p = (...parts) => (parts.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content: inline(parts) });

export const h = (level, value) => ({ type: 'heading', attrs: { level }, content: [text(value)] });
export const h1 = (value) => h(1, value);
export const h2 = (value) => h(2, value);
export const h3 = (value) => h(3, value);

export const ol = (...items) => ({ type: 'orderedList', content: items.map((item) => ({ type: 'listItem', content: [Array.isArray(item) ? p(...item) : p(item)] })) });
export const ul = (...items) => ({ type: 'bulletList', content: items.map((item) => ({ type: 'listItem', content: [Array.isArray(item) ? p(...item) : p(item)] })) });

export const tasks = (...items) => ({
  type: 'taskList',
  content: items.map(([checked, ...parts]) => ({ type: 'taskItem', attrs: { checked }, content: [p(...parts)] }))
});

const cell = (value, header) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [value === '' ? { type: 'paragraph' } : p(String(value))] });

export const table = (header, rows) => ({
  type: 'table',
  content: [{ type: 'tableRow', content: header.map((value) => cell(value, true)) }, ...rows.map((row) => ({ type: 'tableRow', content: row.map((value, index) => cell(value, index === 0)) }))]
});

export const doc = (...blocks) => ({ type: 'doc', content: [...blocks, { type: 'paragraph' }] });

// ---- blocks ------------------------------------------------------------------------------

let counter = 0;
export const id = (prefix) => `${prefix}-${(counter += 1).toString(36).padStart(4, '0')}`;

export function component(role, entity, overrides = {}) {
  return {
    id: id('c'),
    role,
    roleSource: 'text',
    entityId: entity?.id ?? null,
    label: entity?.label ?? '',
    molecularWeight: entity?.attributes?.molecularWeight ?? null,
    smiles: entity?.attributes?.smiles ?? null,
    equivalents: role === 'product' ? 1 : null,
    mass: null,
    volume: null,
    amount: null,
    density: entity?.attributes?.density ?? null,
    concentration: null,
    purity: null,
    limiting: false,
    actualMass: null,
    ...overrides
  };
}

export function reaction({ title = '', components, conditions = null, scheme = null, collapsed = true, details = false }) {
  return {
    type: 'reaction',
    attrs: {
      title,
      components,
      conditions: conditions ? { temperature: null, temperatureLabel: null, time: null, atmosphere: null, pressure: null, stirring: null, notes: [], ...conditions } : null,
      scheme,
      collapsed,
      details
    }
  };
}

export function plate({ title = '', format = 96, measure = '', groups, wells, entityId = null }) {
  return { type: 'plate', attrs: { title, format, groups, wells, measure, entityId } };
}

export const plateGroup = (gid, label, color, entity = null) => ({ id: gid, label, color, entityId: entity?.id ?? null, entityType: entity?.type ?? null });

export function results({ title = '', columns, rows }) {
  const cols = columns.map(([label, unit = '']) => ({ id: id('col'), label, unit }));
  return {
    type: 'results',
    attrs: {
      title,
      columns: cols,
      rows: rows.map(([sample, values, note = '']) => ({
        id: id('row'),
        entityId: typeof sample === 'string' ? null : sample.id,
        entityType: typeof sample === 'string' ? null : sample.type,
        label: typeof sample === 'string' ? sample : sample.label,
        values: Object.fromEntries(values.map((value, index) => [cols[index].id, value]).filter(([, value]) => value !== null && value !== undefined)),
        note
      }))
    }
  };
}

// Dates relative to today, as the notebook stores them.
export function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
