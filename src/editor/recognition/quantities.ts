// Finds amounts still written as plain text ("25 mg", "2,5mL") so they can become quantity
// tokens with one click. Deterministic: number + known unit on word boundaries. Explicit
// extension for the test runner.
import { QUANTITY_SOURCE, parseQuantity, type Quantity } from '../../units/quantity.ts';
import { insideTrigger } from './matcher.ts';

export type QuantityMatch = { start: number; end: number; quantity: Quantity; matched: string };

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
