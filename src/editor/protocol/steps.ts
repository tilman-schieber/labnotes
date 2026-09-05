// Protocol steps: a paragraph that starts with an imperative lab verb is a step. Deterministic,
// word-list based. Explicit extension for the test runner.
import { findUnit, formatQuantity, type Quantity } from '../../units/quantity.ts';

const STEP_VERBS = [
  'add', 'adjust', 'aliquot', 'allow', 'autoclave', 'boil', 'bubble', 'cap', 'centrifuge', 'check', 'chill', 'collect', 'combine',
  'concentrate', 'cool', 'count', 'crystallize', 'crystallise', 'decant', 'degas', 'develop', 'dilute', 'discard', 'dissolve',
  'distill', 'dry', 'elute', 'evaporate', 'expose', 'extract', 'filter', 'fix', 'flush', 'freeze', 'harvest', 'heat', 'hold',
  'image', 'incubate', 'inoculate', 'irradiate', 'keep', 'label', 'let', 'load', 'lyse', 'measure', 'mix', 'monitor', 'mount',
  'note', 'observe', 'pellet', 'pipette', 'place', 'plate', 'pool', 'pour', 'precipitate', 'prepare', 'purge', 'purify', 'quench',
  'record', 'recrystallize', 'recrystallise', 'reflux', 'remove', 'repeat', 'resuspend', 'rinse', 'run', 'seal', 'seed', 'set',
  'shake', 'sonicate', 'spin', 'split', 'spot', 'stain', 'start', 'stir', 'stop', 'store', 'streak', 'take', 'thaw', 'titrate',
  'transfer', 'treat', 'vortex', 'wait', 'warm', 'wash', 'weigh'
];

const STEP_VERB_SET = new Set(STEP_VERBS);

// The verb a step starts with, or null when the paragraph is not an instruction.
export function stepVerb(text: string): string | null {
  const first = /^\s*([\p{L}]+)/u.exec(text)?.[1]?.toLowerCase();
  return first && STEP_VERB_SET.has(first) ? first : null;
}

export type StepConditions = { duration: Quantity | null; temperature: Quantity | null };

// Time and temperature amounts in a step describe how it is run rather than what is consumed.
export function stepConditions(quantities: Quantity[]): StepConditions {
  const byDimension = (dimension: string) => quantities.find((quantity) => findUnit(quantity.unit)?.dimension === dimension) ?? null;
  return { duration: byDimension('time'), temperature: byDimension('temperature') };
}

export function describeConditions(conditions: StepConditions): string {
  return [conditions.duration, conditions.temperature]
    .filter((quantity): quantity is Quantity => quantity !== null)
    .map(formatQuantity)
    .join(' · ');
}
