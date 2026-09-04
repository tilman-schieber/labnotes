import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockState, usageTimeline } from './stock.ts';

test('stock subtracts usage totals in the recorded unit', () => {
  const state = stockState({ amount: '250 g' }, [{ dimension: 'mass', quantity: { value: 75, unit: 'g' } }]);
  assert.deepEqual(state?.remaining, { value: 175, unit: 'g' });
  assert.equal(state?.level, 'ok');
  assert.equal(Number(state?.fraction.toFixed(2)), 0.7);

  const low = stockState({ amount: '1 L' }, [{ dimension: 'volume', quantity: { value: 950, unit: 'mL' } }]);
  assert.equal(low?.level, 'low');
  assert.deepEqual(low?.remaining, { value: 0.05, unit: 'L' });

  const gone = stockState({ amount: '10 mg' }, [{ dimension: 'mass', quantity: { value: 12, unit: 'mg' } }]);
  assert.equal(gone?.level, 'depleted');
});

test('stock ignores missing, unparseable or non-consumable amounts', () => {
  assert.equal(stockState({}, []), null);
  assert.equal(stockState({ amount: 'lots' }, []), null);
  assert.equal(stockState({ amount: '30 min' }, []), null);
  assert.equal(stockState({ amount: '2 M' }, []), null);
});

test('timeline orders by experiment date and keeps running totals per dimension', () => {
  const rows = usageTimeline([
    { id: 'b', documentId: 'd2', documentTitle: 'Later', documentDate: '2026-09-03', documentCreatedAt: '2026-09-01T10:00:00Z', quantities: [{ value: 500, unit: 'mg' }, { value: 10, unit: 'min' }], role: null, sentence: null },
    { id: 'a', documentId: 'd1', documentTitle: 'Earlier', documentDate: null, documentCreatedAt: '2026-09-02T10:00:00Z', quantities: [{ value: 1, unit: 'g' }, { value: 2, unit: 'mL' }], role: null, sentence: null }
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['a', 'b']);
  assert.deepEqual(rows[0].cumulative, [{ value: 1, unit: 'g' }, { value: 2, unit: 'mL' }]);
  assert.deepEqual(rows[1].cumulative, [{ value: 1.5, unit: 'g' }, { value: 2, unit: 'mL' }]);
});
