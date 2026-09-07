// Codes for experiments and the batches they produce: TS-012 is experiment 12 of a project, run
// by TS; TS-012-A is the first product batch registered from it. Pure; explicit .ts imports.

export function formatExperimentNumber(number: number): string {
  return String(number).padStart(3, '0');
}

export function experimentCode(initials: string | null | undefined, number: number | null | undefined): string | null {
  if (!number || !Number.isInteger(number) || number <= 0) {
    return null;
  }
  const prefix = (initials ?? '').trim().toUpperCase();
  return `${prefix ? `${prefix}-` : ''}${formatExperimentNumber(number)}`;
}

// A, B, … Z, AA, AB, … so a long list of batches still sorts.
export function letterFor(index: number): string {
  let value = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}

function indexOfLetter(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

export function batchCode(initials: string | null | undefined, number: number, letter: string): string {
  return `${experimentCode(initials, number) ?? formatExperimentNumber(number)}-${letter.toUpperCase()}`;
}

// The next unused letter given the batch codes already registered from an experiment.
export function nextBatchLetter(existingCodes: string[]): string {
  let highest = -1;
  for (const code of existingCodes) {
    const match = /-([A-Za-z]+)$/.exec(code.trim());
    if (match) {
      highest = Math.max(highest, indexOfLetter(match[1]));
    }
  }
  return letterFor(highest + 1);
}

export function parseBatchCode(code: string): { prefix: string; number: number; letter: string } | null {
  const match = /^(?:([A-Za-z0-9]+)-)?(\d{1,6})-([A-Za-z]+)$/.exec(code.trim());
  if (!match) {
    return null;
  }
  return { prefix: (match[1] ?? '').toUpperCase(), number: Number(match[2]), letter: match[3].toUpperCase() };
}
