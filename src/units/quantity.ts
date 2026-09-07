// Unit-aware quantities for notebook text. Kept dependency-free and pure so it can be
// unit-tested and later reused server-side for extraction.

export type Dimension =
  | 'mass'
  | 'volume'
  | 'amount'
  | 'concentration'
  // mass per volume (g/L base): mg/mL solutions, ppm, % w/v
  | 'massConcentration'
  | 'temperature'
  | 'time'
  | 'ratio'
  | 'pressure'
  | 'rate';

export type UnitDefinition = {
  symbol: string;
  dimension: Dimension;
  // Multiply a value in this unit by `factor` to get the dimension's base unit
  // (g, L, mol, mol/L, K, s, 1). Temperature additionally needs `offset`.
  factor: number;
  offset?: number;
  aliases?: string[];
};

const SI_PREFIXES: Record<string, number> = { n: 1e-9, µ: 1e-6, u: 1e-6, μ: 1e-6, m: 1e-3, c: 1e-2, k: 1e3 };

function prefixed(symbol: string, dimension: Dimension, prefixes: string[], aliasesFor: (prefix: string) => string[] = () => []): UnitDefinition[] {
  return [
    { symbol, dimension, factor: 1 },
    ...prefixes.map((prefix) => ({
      symbol: `${prefix}${symbol}`,
      dimension,
      factor: SI_PREFIXES[prefix],
      aliases: prefix === 'µ' ? [`u${symbol}`, `μ${symbol}`, ...aliasesFor(prefix)] : aliasesFor(prefix)
    }))
  ];
}

export const UNITS: UnitDefinition[] = [
  ...prefixed('g', 'mass', ['n', 'µ', 'm', 'k']),
  // Litre also accepts the lowercase "l" spelling for every prefix/alias combination.
  ...prefixed('L', 'volume', ['n', 'µ', 'm']).map((unit) => {
    const spellings = [unit.symbol, ...(unit.aliases ?? [])];
    return { ...unit, aliases: [...(unit.aliases ?? []), ...spellings.map((spelling) => spelling.replace('L', 'l'))] };
  }),
  ...prefixed('mol', 'amount', ['n', 'µ', 'm']),
  ...prefixed('M', 'concentration', ['n', 'µ', 'm']),
  { symbol: '°C', dimension: 'temperature', factor: 1, offset: 273.15, aliases: ['C', 'degC'] },
  { symbol: 'K', dimension: 'temperature', factor: 1 },
  { symbol: 's', dimension: 'time', factor: 1, aliases: ['sec'] },
  { symbol: 'min', dimension: 'time', factor: 60 },
  { symbol: 'h', dimension: 'time', factor: 3600, aliases: ['hr'] },
  { symbol: 'd', dimension: 'time', factor: 86400 },
  { symbol: 'eq', dimension: 'ratio', factor: 1, aliases: ['equiv', 'equiv.', 'eq.'] },
  { symbol: '%', dimension: 'ratio', factor: 0.01 },
  // Percentages that say what they are a percentage of. mol% is a ratio to the limiting reagent
  // (5 mol% = 0.05 eq); wt% and v/v% describe a mixture and need a density or a volume to become
  // an amount.
  { symbol: 'mol%', dimension: 'ratio', factor: 0.01, aliases: ['mol-%', 'mol %'] },
  { symbol: 'wt%', dimension: 'ratio', factor: 0.01, aliases: ['wt.%', 'wt-%', 'w/w%', '%w/w', 'w/w'] },
  { symbol: 'v/v%', dimension: 'ratio', factor: 0.01, aliases: ['%v/v', 'vol%', 'vol-%', 'v/v'] },
  // Mass per volume, base g/L. "ppm" is the aqueous convention (1 mg/L).
  { symbol: 'g/L', dimension: 'massConcentration', factor: 1, aliases: ['g/l'] },
  { symbol: 'mg/mL', dimension: 'massConcentration', factor: 1, aliases: ['mg/ml'] },
  { symbol: 'µg/mL', dimension: 'massConcentration', factor: 1e-3, aliases: ['ug/mL', 'ug/ml', 'µg/ml', 'μg/mL', 'mg/L', 'mg/l', 'ppm'] },
  { symbol: 'ng/mL', dimension: 'massConcentration', factor: 1e-6, aliases: ['ng/ml', 'µg/L', 'ug/L', 'ppb'] },
  { symbol: 'w/v%', dimension: 'massConcentration', factor: 10, aliases: ['%w/v', 'w/v'] },
  // Pressure in pascal; "Torr" and "mmHg" are the same thing at the precision a notebook needs.
  { symbol: 'bar', dimension: 'pressure', factor: 1e5 },
  { symbol: 'mbar', dimension: 'pressure', factor: 100 },
  { symbol: 'atm', dimension: 'pressure', factor: 101325 },
  { symbol: 'Torr', dimension: 'pressure', factor: 133.322, aliases: ['torr', 'mmHg'] },
  { symbol: 'psi', dimension: 'pressure', factor: 6894.76 },
  // Stirring and centrifuge speeds; the base unit is revolutions per second.
  { symbol: 'rpm', dimension: 'rate', factor: 1 / 60 }
];

const UNIT_BY_TOKEN = new Map<string, UnitDefinition>();
UNITS.forEach((unit) => {
  UNIT_BY_TOKEN.set(unit.symbol, unit);
  unit.aliases?.forEach((alias) => UNIT_BY_TOKEN.set(alias, unit));
});

export function findUnit(token: string): UnitDefinition | null {
  return UNIT_BY_TOKEN.get(token.trim()) ?? null;
}

export type Quantity = {
  value: number;
  unit: string;
};

// Unit tokens, longest first so e.g. "mmol" wins over "mol" and "min" over "m".
const UNIT_TOKENS = [...UNIT_BY_TOKEN.keys()].sort((left, right) => right.length - left.length);
const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const UNIT_PATTERN = UNIT_TOKENS.map(escapeForRegex).join('|');

// Matches "12.5 mL", "12,5mL", "-20 °C" (decimal comma accepted). Anchoring is the caller's job.
export const QUANTITY_SOURCE = `(-?\\d+(?:[.,]\\d+)?)\\s?(${UNIT_PATTERN})`;

export function parseQuantity(text: string): Quantity | null {
  const match = new RegExp(`^\\s*${QUANTITY_SOURCE}\\s*$`).exec(text);
  if (!match) {
    return null;
  }

  const unit = findUnit(match[2]);
  if (!unit) {
    return null;
  }

  return { value: Number(match[1].replace(',', '.')), unit: unit.symbol };
}

export function toBase(quantity: Quantity): number {
  const unit = findUnit(quantity.unit);
  if (!unit) {
    throw new Error(`Unknown unit: ${quantity.unit}`);
  }
  return (quantity.value + (unit.offset ?? 0)) * unit.factor;
}

export function convert(quantity: Quantity, targetUnit: string): Quantity {
  const source = findUnit(quantity.unit);
  const target = findUnit(targetUnit);
  if (!source || !target) {
    throw new Error(`Unknown unit: ${!source ? quantity.unit : targetUnit}`);
  }
  if (source.dimension !== target.dimension) {
    throw new Error(`Cannot convert ${source.dimension} to ${target.dimension}`);
  }

  const base = toBase(quantity);
  // Strip binary floating-point noise (2 mL -> 1999.9999999999998 µL) without losing real precision.
  const value = Number((base / target.factor - (target.offset ?? 0)).toPrecision(12));
  return { value, unit: target.symbol };
}

// Rounds away floating-point noise without hiding real precision.
export function formatValue(value: number, significant = 6): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (value === 0) {
    return '0';
  }
  const rounded = Number(value.toPrecision(significant));
  return String(rounded);
}

export function formatQuantity(quantity: Quantity): string {
  const unit = findUnit(quantity.unit);
  const symbol = unit?.symbol ?? quantity.unit;
  const space = symbol === '%' || symbol === '°C' ? (symbol === '°C' ? ' ' : '') : ' ';
  return `${formatValue(quantity.value)}${space}${symbol}`;
}

// Sensible alternative units for a hover/tooltip, in the same dimension.
export function conversionsFor(quantity: Quantity): Quantity[] {
  const unit = findUnit(quantity.unit);
  if (!unit) {
    return [];
  }

  return UNITS.filter((candidate) => candidate.dimension === unit.dimension && candidate.symbol !== unit.symbol && !candidate.symbol.startsWith('n'))
    .map((candidate) => convert(quantity, candidate.symbol))
    .filter((converted) => Math.abs(converted.value) >= 0.001 && Math.abs(converted.value) < 1e6);
}
