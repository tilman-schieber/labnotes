// Stock and consumption arithmetic over usage rows. Pure so it can be unit-tested and shared
// by the registry and the editor hover card. Explicit .ts extension for the test runner.
import { convert, findUnit, parseQuantity, toBase, type Quantity } from '../units/quantity.ts';

export type UsageTotal = { dimension: string; quantity: Quantity };

export type StockState = {
  initial: Quantity;
  used: Quantity;
  remaining: Quantity;
  // 0..1 of the initial amount still there
  fraction: number;
  level: 'ok' | 'low' | 'depleted';
};

const STOCK_DIMENSIONS = new Set(['mass', 'volume', 'amount']);
const LOW_FRACTION = 0.1;

// `attributes.amount` is the stock recorded in the registry; everything used since (per the
// usage totals in the same dimension) comes off it.
export function stockState(attributes: Record<string, unknown> | null | undefined, usageTotals: UsageTotal[]): StockState | null {
  const raw = attributes?.amount;
  const initial = typeof raw === 'string' ? parseQuantity(raw) : null;
  const dimension = initial ? findUnit(initial.unit)?.dimension : null;
  if (!initial || !dimension || !STOCK_DIMENSIONS.has(dimension)) {
    return null;
  }

  const total = usageTotals.find((item) => item.dimension === dimension);
  const used = total ? convert(total.quantity, initial.unit) : { value: 0, unit: initial.unit };
  const remainingValue = Number((initial.value - used.value).toPrecision(6));
  const fraction = initial.value > 0 ? Math.min(1, Math.max(0, remainingValue) / initial.value) : 0;

  return {
    initial,
    used: { value: Number(used.value.toPrecision(6)), unit: initial.unit },
    remaining: { value: remainingValue, unit: initial.unit },
    fraction,
    level: remainingValue <= 0 ? 'depleted' : fraction < LOW_FRACTION ? 'low' : 'ok'
  };
}

export type TimelineUsage = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentDate: string | null;
  documentCreatedAt: string;
  quantities: Quantity[];
  role: string | null;
  sentence: string | null;
};

export type TimelineRow = TimelineUsage & {
  // Best date for ordering: the experiment's date field, else when it was created.
  date: string;
  // Running totals per dimension after this row, in the unit the dimension was first seen in.
  cumulative: Quantity[];
};

// Usages in chronological order with running totals. Time and temperature are conditions, not
// consumption, and are left out of the totals.
export function usageTimeline(usages: TimelineUsage[]): TimelineRow[] {
  const ordered = [...usages]
    .map((usage) => ({ ...usage, date: usage.documentDate ?? usage.documentCreatedAt.slice(0, 10) }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.documentCreatedAt.localeCompare(right.documentCreatedAt));

  const running = new Map<string, { base: number; unit: string }>();
  return ordered.map((usage) => {
    for (const quantity of usage.quantities) {
      const unit = findUnit(quantity.unit);
      if (!unit || !STOCK_DIMENSIONS.has(unit.dimension)) {
        continue;
      }
      const current = running.get(unit.dimension) ?? { base: 0, unit: quantity.unit };
      running.set(unit.dimension, { base: current.base + toBase(quantity), unit: current.unit });
    }
    const cumulative = [...running.entries()].map(([dimension, total]) => {
      const baseUnit = { mass: 'g', volume: 'L', amount: 'mol' }[dimension] ?? total.unit;
      return convert({ value: total.base, unit: baseUnit }, total.unit);
    });
    return { ...usage, cumulative };
  });
}
