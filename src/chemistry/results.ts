// Derives *results* — a measured value for an entity — from the prose, from results blocks and
// from plates. Like usages, deterministic and derived on every save; the sentence is the record.
//
//   "OD600 of #Culture A was 1.21"            → Culture A · OD600 · 1.21
//   "#Batch 7: purity 98.5 %"                 → Batch 7 · purity · 98.5 %
//   "The Tm of #Primer F1 is 61.3 °C"         → Primer F1 · Tm · 61.3 °C
//
// A results block gives one result per row and column; a plate with a measure gives the mean
// over each group that is a registry entity.
import { findUnit } from '../units/quantity.ts';
import { groupStats, type PlateAttrs } from '../plates/plate.ts';
import { inlineTokens, proseBlocks, sentences, type Token } from './usages.ts';

export type ResultSource = 'prose' | 'block' | 'plate';

export type Result = {
  entityId: string;
  label: string;
  entityType: string | null;
  // What was measured, as written: "OD600", "yield", "Tm", "cell count".
  measure: string;
  value: number;
  // Unit as written, '' for a bare number.
  unit: string;
  blockIndex: number;
  // Where it came from: the sentence, the block title, or "mean of n wells".
  sentence: string;
  source: ResultSource;
};

type JsonNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

export type ResultsColumn = { id: string; label: string; unit: string };
export type ResultsRow = { id: string; entityId: string | null; entityType: string | null; label: string; values: Record<string, number | null>; note: string };
export type ResultsAttrs = { title: string; columns: ResultsColumn[]; rows: ResultsRow[] };

// Up to three words, each starting with a letter, so "purity 98.5" cannot be split into "purity 9" + "8.5".
const MEASURE = String.raw`[A-Za-z][A-Za-z0-9_%°]*(?:[ -][A-Za-z][A-Za-z0-9%°]*){0,2}`;
const VERB = String.raw`(?:was|were|is|are|=|:|reads?|measured(?:\s+(?:at|as))?|came\s+(?:to|out\s+(?:at|as)))`;
const NUMBER = String.raw`-?\d+(?:[.,]\d+)?(?:\s*(?:[×x]\s*10\^?|e)-?\d+)?`;
const UNIT = String.raw`[A-Za-zµ%°]+(?:\/[A-Za-zµ]+)?`;

// "⟨measure⟩ of" right before the entity.
const BEFORE = new RegExp(String.raw`(?:^|[\s(,;:])(${MEASURE})\s+of\s*$`, 'i');
// After the entity: "⟨verb⟩ ⟨number⟩ ⟨unit⟩" (measure came before), or ": ⟨measure⟩ ⟨verb⟩? ⟨number⟩ ⟨unit⟩".
const AFTER_VALUE = new RegExp(String.raw`^\s*${VERB}\s*(${NUMBER})\s*(${UNIT})?(?=$|[\s.,;)])`, 'i');
const AFTER_VERB_ONLY = new RegExp(String.raw`^\s*${VERB}\s*$`, 'i');
const AFTER_MEASURE_VALUE = new RegExp(
  String.raw`^\s*(?::\s*(${MEASURE})\s*(?:of\s*)?(?:${VERB}\s*)?|,?\s*(?:has\s+(?:an?\s+)?|with\s+(?:an?\s+)?)?(${MEASURE})\s*(?:${VERB}|of)\s*)(${NUMBER})\s*(${UNIT})?(?=$|[\s.,;)])`,
  'i'
);
const AFTER_MEASURE_VERB_ONLY = new RegExp(String.raw`^\s*[:,]?\s*(?:has\s+(?:an?\s+)?|with\s+(?:an?\s+)?)?(${MEASURE})\s*(?:of\s*)?${VERB}\s*$`, 'i');

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'in', 'into', 'with', 'for', 'from', 'at', 'on', 'of', 'add', 'added', 'use', 'used', 'solution', 'mixture', 'sample', 'aliquot', 'amount', 'volume', 'mass', 'rest', 'part', 'all', 'some', 'each', 'one', 'two', 'three', 'ml', 'mg', 'g', 'l', 'mol', 'mmol', 'µl', 'ul']);

// The words right before "of": drop leading filler ("6 h the OD600" → "OD600"), refuse a unit
// or a stop word as the measure itself ("mL of #X", "solution of #X").
function cleanMeasure(raw: string): string | null {
  const words = raw.replace(/\s+/g, ' ').trim().split(' ');
  while (words.length > 0 && (STOP.has(words[0].toLowerCase()) || findUnit(words[0]) || /^\d/.test(words[0]))) {
    words.shift();
  }
  if (words.length === 0) {
    return null;
  }
  const measure = words.join(' ');
  if (STOP.has(words[words.length - 1].toLowerCase()) || findUnit(measure)) {
    return null;
  }
  return measure;
}

// Units a reader prints that the quantity module does not know: absorbance, fluorescence, counts.
const EXTRA_UNITS = /^(AU|mAU|OD|RFU|RLU|cfu|CFU|cells|ppm|ppb|nm|kDa|Da|bp|kb|rpm|psi|mOsm|U|mU|IU)$/;

function cleanUnit(raw: string | undefined): string {
  const unit = (raw ?? '').trim();
  if (!unit) {
    return '';
  }
  return findUnit(unit) || /[%°/]/.test(unit) || EXTRA_UNITS.test(unit) ? unit : '';
}

function parseNumber(raw: string): number | null {
  const normalised = raw
    .replace(',', '.')
    .replace(/\s*[×x]\s*10\^?/, 'e')
    .replace(/\s+/g, '');
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

function textOf(tokens: Token[]): string {
  return tokens
    .map((token) => (token.kind === 'text' ? token.text : token.kind === 'entity' ? token.label : `${token.value} ${token.unit}`))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// The value right after a verb: inline "1.21 OD" text, or a quantity token following "was".
function valueAfter(sentence: Token[], index: number, pattern: RegExp, verbOnly: RegExp, measureGroup: boolean): { measure?: string; value: number; unit: string } | null {
  const next = sentence[index + 1];
  if (!next || next.kind !== 'text') {
    return null;
  }
  const inline = pattern.exec(next.text);
  if (inline) {
    const value = parseNumber(measureGroup ? inline[3] : inline[1]);
    if (value === null) {
      return null;
    }
    return { measure: measureGroup ? inline[1] ?? inline[2] : undefined, value, unit: cleanUnit(measureGroup ? inline[4] : inline[2]) };
  }
  const verb = verbOnly.exec(next.text);
  const quantity = sentence[index + 2];
  if (verb && quantity?.kind === 'quantity') {
    return { measure: measureGroup ? verb[1] : undefined, value: quantity.value, unit: quantity.unit };
  }
  return null;
}

export function resultsFromSentence(sentence: Token[], blockIndex: number): Result[] {
  const found: Result[] = [];
  sentence.forEach((token, index) => {
    if (token.kind !== 'entity') {
      return;
    }
    const previous = sentence[index - 1];
    const before = previous?.kind === 'text' ? BEFORE.exec(previous.text) : null;
    let measure = before ? cleanMeasure(before[1]) : null;
    let hit = measure ? valueAfter(sentence, index, AFTER_VALUE, AFTER_VERB_ONLY, false) : null;
    if (!hit) {
      hit = valueAfter(sentence, index, AFTER_MEASURE_VALUE, AFTER_MEASURE_VERB_ONLY, true);
      measure = hit?.measure ? cleanMeasure(hit.measure) : null;
    }
    if (!hit || !measure) {
      return;
    }
    found.push({
      entityId: token.id,
      label: token.label,
      entityType: token.entityType,
      measure,
      value: hit.value,
      unit: hit.unit,
      blockIndex,
      sentence: textOf(sentence),
      source: 'prose'
    });
  });
  return found;
}

function blockResults(node: JsonNode, blockIndex: number, into: Result[]): void {
  const attrs = node.attrs as Partial<ResultsAttrs> | undefined;
  const columns = Array.isArray(attrs?.columns) ? attrs.columns : [];
  const rows = Array.isArray(attrs?.rows) ? attrs.rows : [];
  for (const row of rows) {
    if (!row?.entityId) {
      continue;
    }
    for (const column of columns) {
      const value = row.values?.[column.id];
      if (typeof value !== 'number' || !Number.isFinite(value) || !column.label) {
        continue;
      }
      into.push({
        entityId: row.entityId,
        label: row.label,
        entityType: row.entityType ?? null,
        measure: column.label,
        value,
        unit: column.unit ?? '',
        blockIndex,
        sentence: [attrs?.title, row.note].filter(Boolean).join(' · '),
        source: 'block'
      });
    }
  }
}

function plateResults(node: JsonNode, blockIndex: number, into: Result[]): void {
  const attrs = node.attrs as Partial<PlateAttrs> | undefined;
  if (!attrs?.measure || !Array.isArray(attrs.groups)) {
    return;
  }
  const plate = { title: attrs.title ?? '', format: attrs.format ?? 96, groups: attrs.groups, wells: attrs.wells ?? {}, measure: attrs.measure } as PlateAttrs;
  for (const group of plate.groups) {
    if (!group.entityId) {
      continue;
    }
    const stats = groupStats(plate, group.id);
    if (stats.mean === null) {
      continue;
    }
    into.push({
      entityId: group.entityId,
      label: group.label,
      entityType: group.entityType ?? null,
      measure: plate.measure,
      value: Number(stats.mean.toPrecision(4)),
      unit: '',
      blockIndex,
      sentence: `${plate.title || 'plate'}: mean of ${stats.measured} ${stats.measured === 1 ? 'well' : 'wells'}${stats.sd !== null ? ` (sd ${Number(stats.sd.toPrecision(3))})` : ''}`,
      source: 'plate'
    });
  }
}

export function extractResults(content: JsonNode | null | undefined): Result[] {
  if (!content) {
    return [];
  }
  const results: Result[] = [];
  (content.content ?? []).forEach((block, blockIndex) => {
    if (block.type === 'results') {
      blockResults(block, blockIndex, results);
      return;
    }
    if (block.type === 'plate') {
      plateResults(block, blockIndex, results);
      return;
    }
    const prose: JsonNode[] = [];
    proseBlocks(block, prose);
    for (const paragraph of prose) {
      const tokens: Token[] = [];
      inlineTokens(paragraph, tokens);
      if (!tokens.some((token) => token.kind === 'entity')) {
        continue;
      }
      for (const sentence of sentences(tokens)) {
        results.push(...resultsFromSentence(sentence, blockIndex));
      }
    }
  });
  return results;
}

// Values pasted from a spreadsheet: a header row naming the columns (first cell is the sample
// column, "OD600 (AU)" gives the unit), then one row per sample. Separators as for plates.
export function parseResultsGrid(text: string): { columns: { label: string; unit: string }[]; rows: { label: string; values: (number | null)[] }[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }
  const split = (line: string) => {
    const separator = /\t/.test(line) ? /\t/ : /;/.test(line) ? /;/ : /,/.test(line) && !/^-?\d+,\d+$/.test(line) ? /,/ : /\s{2,}|\s(?=-?\d)/;
    return line.split(separator).map((cell) => cell.trim());
  };
  const header = split(lines[0]);
  const columns = header.slice(1).map((cell) => {
    const match = /^(.*?)\s*[(\[]\s*([^)\]]+)\s*[)\]]\s*$/.exec(cell);
    return match ? { label: match[1].trim(), unit: match[2].trim() } : { label: cell, unit: '' };
  });
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    return {
      label: cells[0] ?? '',
      values: columns.map((_, index) => {
        const cell = cells[index + 1];
        if (cell === undefined || cell === '') {
          return null;
        }
        const value = parseNumber(cell);
        return value;
      })
    };
  });
  return { columns, rows: rows.filter((row) => row.label) };
}
