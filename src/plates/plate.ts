// A microplate as data: a format (wells per plate), a legend of groups (what went into the
// wells, optionally a registry entity) and the wells themselves, each with a group, a note and
// one measured value. Everything here is pure so the node view, the PDF export and the tests
// share it.

export const PLATE_FORMATS = [6, 12, 24, 48, 96, 384] as const;
export type PlateFormat = (typeof PLATE_FORMATS)[number];

const LAYOUT: Record<PlateFormat, { rows: number; cols: number }> = {
  6: { rows: 2, cols: 3 },
  12: { rows: 3, cols: 4 },
  24: { rows: 4, cols: 6 },
  48: { rows: 6, cols: 8 },
  96: { rows: 8, cols: 12 },
  384: { rows: 16, cols: 24 }
};

export type PlateGroup = {
  id: string;
  label: string;
  // CSS colour; one of PALETTE unless the writer picked otherwise.
  color: string;
  // What the group is, when it is something from the registry.
  entityId: string | null;
  entityType: string | null;
};

export type PlateWell = {
  group: string | null;
  note: string;
  value: number | null;
};

export type PlateAttrs = {
  title: string;
  format: PlateFormat;
  groups: PlateGroup[];
  // Keyed by well id ("A1"); wells not listed are empty.
  wells: Record<string, PlateWell>;
  // What the values are: "OD600", "fluorescence", "CFU"…
  measure: string;
  // Registry container this plate is, once registered from the block.
  entityId?: string | null;
};

export const PALETTE = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb7185', '#2dd4bf', '#facc15', '#94a3b8', '#c084fc', '#fb923c', '#4ade80'];

export const EMPTY_WELL: PlateWell = { group: null, note: '', value: null };

export function isPlateFormat(value: unknown): value is PlateFormat {
  return typeof value === 'number' && (PLATE_FORMATS as readonly number[]).includes(value);
}

export function plateLayout(format: PlateFormat): { rows: number; cols: number } {
  return LAYOUT[format];
}

export function rowLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export function wellId(row: number, col: number): string {
  return `${rowLabel(row)}${col + 1}`;
}

// "A1" → { row: 0, col: 0 }; null when the id is not a well of this format.
export function parseWellId(id: string, format: PlateFormat): { row: number; col: number } | null {
  const match = /^([A-P])(\d{1,2})$/i.exec(id.trim());
  if (!match) {
    return null;
  }
  const row = match[1].toUpperCase().charCodeAt(0) - 65;
  const col = Number(match[2]) - 1;
  const { rows, cols } = LAYOUT[format];
  return row < rows && col >= 0 && col < cols ? { row, col } : null;
}

export function wellIds(format: PlateFormat): string[] {
  const { rows, cols } = LAYOUT[format];
  const ids: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ids.push(wellId(row, col));
    }
  }
  return ids;
}

export function createGroup(label: string, existing: PlateGroup[]): PlateGroup {
  const used = new Set(existing.map((group) => group.color));
  const color = PALETTE.find((candidate) => !used.has(candidate)) ?? PALETTE[existing.length % PALETTE.length];
  return { id: Math.random().toString(36).slice(2, 10), label, color, entityId: null, entityType: null };
}

export function createPlate(format: PlateFormat = 96): PlateAttrs {
  return { title: '', format, groups: [], wells: {}, measure: '' };
}

export function wellAt(attrs: PlateAttrs, id: string): PlateWell {
  return attrs.wells[id] ?? EMPTY_WELL;
}

// Writes a well back, dropping it from the map when it is empty again.
export function setWell(wells: Record<string, PlateWell>, id: string, changes: Partial<PlateWell>): Record<string, PlateWell> {
  const next = { ...(wells[id] ?? EMPTY_WELL), ...changes };
  const copy = { ...wells };
  if (next.group === null && next.note === '' && next.value === null) {
    delete copy[id];
  } else {
    copy[id] = next;
  }
  return copy;
}

// Changing the format keeps whatever still fits on the new plate.
export function fitWells(wells: Record<string, PlateWell>, format: PlateFormat): Record<string, PlateWell> {
  const kept: Record<string, PlateWell> = {};
  for (const [id, well] of Object.entries(wells)) {
    if (parseWellId(id, format)) {
      kept[id] = well;
    }
  }
  return kept;
}

// Values pasted from a plate reader: one row of the plate per line, cells separated by tabs,
// semicolons, commas or runs of spaces. A leading header row (1 2 3 …) and leading row labels
// (A, B, …) are skipped. "1,5" is a decimal comma only when the line has no other separator.
export function parseValueGrid(text: string, format: PlateFormat): Record<string, number> {
  const { rows, cols } = LAYOUT[format];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const values: Record<string, number> = {};
  let row = 0;
  for (const line of lines) {
    const separator = /\t/.test(line) ? /\t/ : /;/.test(line) ? /;/ : /,/.test(line) && !/^-?\d+,\d+$/.test(line) ? /,/ : /\s+/;
    let cells = line.split(separator).map((cell) => cell.trim());
    // A row label in front ("A", "B"…) or a header row of column numbers.
    if (cells.length > 0 && /^[A-P]$/i.test(cells[0])) {
      cells = cells.slice(1);
    } else {
      const numbered = cells[0] === '' ? cells.slice(1) : cells;
      if (row === 0 && numbered.length >= 2 && numbered.every((cell, index) => cell === String(index + 1))) {
        continue;
      }
    }
    if (row >= rows) {
      break;
    }
    cells.slice(0, cols).forEach((cell, col) => {
      const number = Number(cell.replace(',', '.'));
      if (cell !== '' && Number.isFinite(number)) {
        values[wellId(row, col)] = number;
      }
    });
    row += 1;
  }
  return values;
}

export type GroupStats = { count: number; measured: number; mean: number | null; sd: number | null };

export function groupStats(attrs: PlateAttrs, groupId: string): GroupStats {
  const wells = Object.values(attrs.wells).filter((well) => well.group === groupId);
  const values = wells.map((well) => well.value).filter((value): value is number => value !== null);
  if (values.length === 0) {
    return { count: wells.length, measured: 0, mean: null, sd: null };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null;
  return { count: wells.length, measured: values.length, mean, sd };
}

export function valueRange(attrs: PlateAttrs): { min: number; max: number } | null {
  const values = Object.values(attrs.wells)
    .map((well) => well.value)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

// Numbers as a plate reader would print them: three significant digits, no noise.
export function formatValue(value: number | null): string {
  if (value === null) {
    return '';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value.toPrecision(3)).toString();
}

// Every registry entity a plate refers to, for backlinks and the entity index.
export function plateEntities(attrs: PlateAttrs): { id: string; label: string; type: string }[] {
  return attrs.groups
    .filter((group): group is PlateGroup & { entityId: string } => Boolean(group.entityId))
    .map((group) => ({ id: group.entityId, label: group.label, type: group.entityType ?? 'entity' }));
}

export type NoteSummary = {
  // Notes every annotated well of a column (or row) shares: "kan 0 µg/mL" on column 1.
  columns: { index: number; note: string }[];
  rows: { index: number; note: string }[];
  // The rest, well by well.
  wells: { id: string; note: string }[];
};

// Notes are typed per well, but usually mean a column (a concentration series) or a row. The
// summary says so in a line instead of listing 96 wells.
export function summarizeNotes(attrs: PlateAttrs): NoteSummary {
  const { rows, cols } = LAYOUT[attrs.format];
  const noteOf = (id: string) => attrs.wells[id]?.note ?? '';
  const covered = new Set<string>();
  const columns: NoteSummary['columns'] = [];
  for (let col = 0; col < cols; col += 1) {
    const ids = Array.from({ length: rows }, (_, row) => wellId(row, col)).filter((id) => noteOf(id) !== '');
    const notes = new Set(ids.map(noteOf));
    if (ids.length >= 2 && notes.size === 1) {
      columns.push({ index: col, note: ids.map(noteOf)[0] });
      ids.forEach((id) => covered.add(id));
    }
  }
  const rowsOut: NoteSummary['rows'] = [];
  for (let row = 0; row < rows; row += 1) {
    const ids = Array.from({ length: cols }, (_, col) => wellId(row, col)).filter((id) => noteOf(id) !== '' && !covered.has(id));
    const notes = new Set(ids.map(noteOf));
    if (ids.length >= 2 && notes.size === 1) {
      rowsOut.push({ index: row, note: ids.map(noteOf)[0] });
      ids.forEach((id) => covered.add(id));
    }
  }
  const wells = wellIds(attrs.format)
    .filter((id) => noteOf(id) !== '' && !covered.has(id))
    .map((id) => ({ id, note: noteOf(id) }));
  return { columns, rows: rowsOut, wells };
}
