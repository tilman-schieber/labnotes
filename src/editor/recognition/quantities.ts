// Finds amounts still written as plain text ("25 mg", "2,5mL") so they can become quantity
// tokens with one click. Deterministic: number + known unit on word boundaries. Explicit
// extension for the test runner.
import { QUANTITY_SOURCE, parseQuantity, type Quantity } from '../../units/quantity.ts';
import { insideTrigger } from './matcher.ts';

export type QuantityMatch = { start: number; end: number; quantity: Quantity; matched: string };

// What the editor's input rule fires on: a quantity at the end of the typed text, terminated by
// whitespace or by the punctuation that follows an amount in ordinary notation — "(10.0 mmol,
// 1.0 equiv)", "for 4 h.", "at 0 °C;". The terminator is kept as text after the token, and an
// opening bracket may precede the number.
const INPUT_TERMINATORS = '[\\s,;:.)\\]]';
export const QUANTITY_INPUT_REGEX = new RegExp(`(?:^|[\\s(\\[])${QUANTITY_SOURCE}(${INPUT_TERMINATORS})$`);
const INPUT_REGEX = QUANTITY_INPUT_REGEX;

export type QuantityInputMatch = { quantity: Quantity; trailing: string; start: number; end: number };

// `text` is everything before the caret in the current text block. `start` is the offset of the
// number, `end` the offset just after the unit (before the terminator).
export function quantityInputMatch(text: string): QuantityInputMatch | null {
  const match = INPUT_REGEX.exec(text);
  if (!match || match.index === undefined) {
    return null;
  }
  const trailing = match[3];
  const start = match.index + (/^[\s(\[]/.test(match[0]) ? 1 : 0);
  const end = match.index + match[0].length - trailing.length;
  // A glued single-letter unit followed by punctuation is more often a label ("sample 3d.").
  const body = text.slice(start, end);
  if (!/\s/.test(body) && match[2].length < 2 && !/\s/.test(trailing)) {
    return null;
  }
  const quantity = parseQuantity(body);
  if (!quantity) {
    return null;
  }
  return { quantity, trailing, start, end };
}

// No letter/digit/decimal point/reference marker before, no letter/digit after ("2 shows" is not
// "2 s"). A leading minus is a sign ("-20 °C") unless it follows a word ("LB-100 g" is an id).
const REGEX = new RegExp(`(?<![\\p{L}\\p{N}.,#@/])(?<![\\p{L}\\p{N}]-)${QUANTITY_SOURCE}(?![\\p{L}\\p{N}])`, 'gu');

export function findQuantities(text: string): QuantityMatch[] {
  const results: QuantityMatch[] = [];
  REGEX.lastIndex = 0;
  for (const match of text.matchAll(REGEX)) {
    if (match.index === undefined || insideTrigger(text, match.index)) {
      continue;
    }
    // "3d", "2s": a glued single-letter unit is more often a label than an amount.
    if (!/\s/.test(match[0]) && match[2].length < 2) {
      continue;
    }
    const quantity = parseQuantity(match[0]);
    if (!quantity) {
      continue;
    }
    results.push({ start: match.index, end: match.index + match[0].length, quantity, matched: match[0] });
  }
  return results;
}
