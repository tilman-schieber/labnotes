// Reads how a reaction was run — temperature, time, atmosphere, pressure, stirring — from the
// prose of a section, the same way usages read what was used. Deterministic keyword and token
// rules only. Explicit extensions for the test runner.
import { convert, findUnit, formatQuantity, type Quantity } from '../units/quantity.ts';
import { inlineTokens, proseBlocks, type Token } from './usages.ts';

export type Atmosphere = 'N2' | 'Ar' | 'air' | 'H2' | 'CO' | 'O2';

export type ReactionConditions = {
  temperature: Quantity | null;
  // "rt" and "reflux" are temperatures a chemist writes without a number.
  temperatureLabel: 'rt' | 'reflux' | null;
  time: Quantity | null;
  atmosphere: Atmosphere | null;
  pressure: Quantity | null;
  stirring: Quantity | null;
  // Free words worth keeping: dropwise, overnight, microwave, sealed tube, in the dark …
  notes: string[];
};

type JsonNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

export const EMPTY_CONDITIONS: ReactionConditions = {
  temperature: null,
  temperatureLabel: null,
  time: null,
  atmosphere: null,
  pressure: null,
  stirring: null,
  notes: []
};

const ATMOSPHERES: { pattern: RegExp; value: Atmosphere }[] = [
  { pattern: /\b(?:under|in|with)\s+(?:an?\s+)?(?:atmosphere\s+of\s+|stream\s+of\s+)?(?:N2|nitrogen)\b/i, value: 'N2' },
  { pattern: /\b(?:under|in|with)\s+(?:an?\s+)?(?:atmosphere\s+of\s+|stream\s+of\s+)?(?:Ar|argon)\b/, value: 'Ar' },
  { pattern: /\b(?:under|in|with)\s+(?:an?\s+)?(?:atmosphere\s+of\s+|balloon\s+of\s+)?(?:H2|hydrogen)\b/i, value: 'H2' },
  { pattern: /\b(?:under|in|with)\s+(?:an?\s+)?(?:atmosphere\s+of\s+|balloon\s+of\s+)?(?:O2|oxygen)\b/i, value: 'O2' },
  { pattern: /\b(?:under|in|with)\s+(?:an?\s+)?(?:atmosphere\s+of\s+)?(?:CO|carbon monoxide)\b/, value: 'CO' },
  { pattern: /\b(?:open to|under|in)\s+(?:the\s+)?air\b/i, value: 'air' }
];

const NOTE_WORDS: { pattern: RegExp; note: string }[] = [
  { pattern: /\bdropwise\b/i, note: 'dropwise' },
  { pattern: /\bovernight\b/i, note: 'overnight' },
  { pattern: /\bmicrowave/i, note: 'microwave' },
  { pattern: /\bsonicat/i, note: 'sonication' },
  { pattern: /\bin the dark\b/i, note: 'in the dark' },
  { pattern: /\bsealed (?:tube|vial)\b/i, note: 'sealed tube' },
  { pattern: /\bpressure (?:tube|vessel)\b/i, note: 'pressure vessel' },
  { pattern: /\bautoclave\b/i, note: 'autoclave' },
  { pattern: /\bDean[- ]Stark\b/i, note: 'Dean–Stark' },
  { pattern: /\bSchlenk\b/i, note: 'Schlenk' },
  { pattern: /\bglove ?box\b/i, note: 'glovebox' },
  { pattern: /\bdegassed\b/i, note: 'degassed' },
  { pattern: /\bflow\b/i, note: 'flow' },
  { pattern: /\bphotochem|\birradiat|\bblue LED|\bUV\b/i, note: 'irradiation' }
];

const REFLUX = /\breflux(?:ed|ing)?\b/i;
const ROOM_TEMPERATURE = /\b(?:rt|r\.t\.|room temperature|ambient temperature)\b/i;

function textBefore(tokens: Token[], index: number, count = 3): string {
  return tokens
    .slice(Math.max(0, index - count), index)
    .map((token) => (token.kind === 'text' ? token.text : token.kind === 'entity' ? token.label : formatQuantity(token)))
    .join('')
    .replace(/\s+/g, ' ')
    .trimEnd();
}

function plainText(tokens: Token[]): string {
  return tokens
    .map((token) => (token.kind === 'text' ? token.text : token.kind === 'entity' ? token.label : ` ${formatQuantity(token)} `))
    .join('')
    .replace(/\s+/g, ' ');
}

function seconds(quantity: Quantity): number {
  return convert(quantity, 's').value;
}

// The conditions written in `blocks` (the section a reaction table describes).
export function extractConditions(blocks: JsonNode[]): ReactionConditions {
  const prose: JsonNode[] = [];
  blocks.forEach((block) => proseBlocks(block, prose));
  const tokens: Token[] = [];
  prose.forEach((block) => {
    inlineTokens(block, tokens);
    tokens.push({ kind: 'text', text: ' ' });
  });

  const result: ReactionConditions = { ...EMPTY_CONDITIONS, notes: [] };
  let temperatureScore = -1;
  let timeScore = -1;
  let longestTime = -1;

  tokens.forEach((token, index) => {
    if (token.kind !== 'quantity') {
      return;
    }
    const dimension = findUnit(token.unit)?.dimension;
    const before = textBefore(tokens, index);
    const quantity = { value: token.value, unit: token.unit };

    if (dimension === 'temperature') {
      // "heated to 80 °C" beats "at 0 °C" beats a temperature mentioned in passing; among equals
      // the later mention wins, since a procedure moves from addition to reaction temperature.
      const score = /\bstor/i.test(before) ? 0 : /\b(?:heated|warmed|cooled|stirred|kept|maintained)\s+(?:to|at)\s*$/i.test(before) ? 3 : /\b(?:at|to)\s*$/i.test(before) ? 2 : 1;
      if (score >= temperatureScore) {
        temperatureScore = score;
        result.temperature = quantity;
      }
      return;
    }
    if (dimension === 'time') {
      // "for 4 h" is the reaction time; otherwise the longest duration in the section.
      const score = /\bfor\s*$/i.test(before) ? 2 : 1;
      const length = seconds(quantity);
      if (score > timeScore || (score === timeScore && length > longestTime)) {
        timeScore = score;
        longestTime = length;
        result.time = quantity;
      }
      return;
    }
    if (dimension === 'pressure' && !result.pressure) {
      result.pressure = quantity;
      return;
    }
    if (dimension === 'rate' && !result.stirring) {
      result.stirring = quantity;
    }
  });

  const text = plainText(tokens);
  if (REFLUX.test(text)) {
    result.temperatureLabel = 'reflux';
    // "added at 0 °C, then heated to reflux": the number is the addition temperature, not the
    // reaction temperature. Only an explicit "refluxed at 80 °C" keeps a number next to reflux.
    if (result.temperature && temperatureScore < 3 && convert(result.temperature, '°C').value < 35) {
      result.temperature = null;
    }
  } else if (ROOM_TEMPERATURE.test(text)) {
    result.temperatureLabel = 'rt';
  }
  for (const { pattern, value } of ATMOSPHERES) {
    if (pattern.test(text)) {
      result.atmosphere = value;
      break;
    }
  }
  for (const { pattern, note } of NOTE_WORDS) {
    if (pattern.test(text)) {
      result.notes.push(note);
    }
  }

  return result;
}

export function describeConditions(conditions: ReactionConditions | null | undefined): string {
  if (!conditions) {
    return '';
  }
  const parts: string[] = [];
  if (conditions.temperature) {
    parts.push(formatQuantity(conditions.temperature) + (conditions.temperatureLabel === 'reflux' ? ' (reflux)' : ''));
  } else if (conditions.temperatureLabel) {
    parts.push(conditions.temperatureLabel);
  }
  if (conditions.time) {
    parts.push(formatQuantity(conditions.time));
  }
  if (conditions.atmosphere) {
    parts.push(`under ${conditions.atmosphere}`);
  }
  if (conditions.pressure) {
    parts.push(formatQuantity(conditions.pressure));
  }
  if (conditions.stirring) {
    parts.push(formatQuantity(conditions.stirring));
  }
  parts.push(...conditions.notes);
  return parts.join(', ');
}

// Fills what `existing` leaves blank from `fromText`; never overwrites a value already there.
export function mergeConditions(existing: ReactionConditions | null | undefined, fromText: ReactionConditions): ReactionConditions {
  if (!existing) {
    return { ...fromText, notes: [...fromText.notes] };
  }
  return {
    temperature: existing.temperature ?? fromText.temperature,
    temperatureLabel: existing.temperatureLabel ?? fromText.temperatureLabel,
    time: existing.time ?? fromText.time,
    atmosphere: existing.atmosphere ?? fromText.atmosphere,
    pressure: existing.pressure ?? fromText.pressure,
    stirring: existing.stirring ?? fromText.stirring,
    notes: existing.notes.length > 0 ? existing.notes : [...fromText.notes]
  };
}

export function isEmptyConditions(conditions: ReactionConditions | null | undefined): boolean {
  return (
    !conditions ||
    (!conditions.temperature && !conditions.temperatureLabel && !conditions.time && !conditions.atmosphere && !conditions.pressure && !conditions.stirring && conditions.notes.length === 0)
  );
}
