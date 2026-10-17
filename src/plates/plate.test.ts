import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroup, createPlate, fitWells, formatValue, groupStats, parseValueGrid, parseWellId, setWell, summarizeNotes, wellIds } from './plate.ts';

test('well ids follow the plate format', () => {
  assert.equal(wellIds(6).join(' '), 'A1 A2 A3 B1 B2 B3');
  assert.equal(wellIds(96).length, 96);
  assert.equal(wellIds(96)[95], 'H12');
  assert.equal(wellIds(384)[383], 'P24');
  assert.deepEqual(parseWellId('h12', 96), { row: 7, col: 11 });
  assert.equal(parseWellId('I1', 96), null);
  assert.equal(parseWellId('A13', 96), null);
  assert.equal(parseWellId('A0', 96), null);
});

test('setWell drops wells that became empty and fitWells keeps what fits', () => {
  let wells = setWell({}, 'A1', { group: 'g1' });
  wells = setWell(wells, 'H12', { value: 0.5 });
  assert.deepEqual(Object.keys(wells), ['A1', 'H12']);
  wells = setWell(wells, 'A1', { group: null });
  assert.deepEqual(Object.keys(wells), ['H12']);
  assert.deepEqual(Object.keys(fitWells(wells, 24)), []);
  assert.deepEqual(Object.keys(fitWells({ A1: { group: null, note: 'x', value: null }, D6: { group: null, note: '', value: 1 } }, 24)), ['A1', 'D6']);
});

test('parseValueGrid reads reader exports with and without labels', () => {
  const plain = parseValueGrid('0.1\t0.2\t0.3\n0.4\t0.5\t0.6', 6);
  assert.deepEqual(plain, { A1: 0.1, A2: 0.2, A3: 0.3, B1: 0.4, B2: 0.5, B3: 0.6 });

  const labelled = parseValueGrid('\t1\t2\t3\nA\t1,5\t2\t\nB\t0.4\t0.5\t0.6', 6);
  assert.deepEqual(labelled, { A1: 1.5, A2: 2, B1: 0.4, B2: 0.5, B3: 0.6 });

  const commas = parseValueGrid('10,20,30\n4,5,6', 6);
  assert.deepEqual(commas, { A1: 10, A2: 20, A3: 30, B1: 4, B2: 5, B3: 6 });

  const spaces = parseValueGrid('A 0.11  0.12 0.13\nB 0.21 0.22 0.23\nC 9 9 9', 6);
  assert.deepEqual(spaces, { A1: 0.11, A2: 0.12, A3: 0.13, B1: 0.21, B2: 0.22, B3: 0.23 }, 'rows beyond the plate are ignored');
});

test('group stats and value formatting', () => {
  const plate = createPlate(6);
  const group = createGroup('control', []);
  plate.groups = [group];
  plate.wells = {
    A1: { group: group.id, note: '', value: 1 },
    A2: { group: group.id, note: '', value: 3 },
    A3: { group: group.id, note: '', value: null }
  };
  const stats = groupStats(plate, group.id);
  assert.equal(stats.count, 3);
  assert.equal(stats.measured, 2);
  assert.equal(stats.mean, 2);
  assert.equal(stats.sd, Math.SQRT2);
  assert.equal(formatValue(0.123456), '0.123');
  assert.equal(formatValue(1.2), '1.2');
  assert.equal(formatValue(12), '12');
  assert.equal(formatValue(null), '');
});

test('new groups take unused palette colours', () => {
  const first = createGroup('a', []);
  const second = createGroup('b', [first]);
  assert.notEqual(first.color, second.color);
  assert.notEqual(first.id, second.id);
});

test('summarizeNotes folds notes shared by a column or a row', () => {
  const plate = createPlate(6);
  plate.wells = {
    A1: { group: null, note: '0 µM', value: null },
    B1: { group: null, note: '0 µM', value: null },
    A2: { group: null, note: '1 µM', value: null },
    B2: { group: null, note: '1 µM', value: null },
    A3: { group: null, note: 'bubble', value: null },
    B3: { group: null, note: '', value: null }
  };
  assert.deepEqual(summarizeNotes(plate), {
    columns: [
      { index: 0, note: '0 µM' },
      { index: 1, note: '1 µM' }
    ],
    rows: [],
    wells: [{ id: 'A3', note: 'bubble' }]
  });
  plate.wells = { A1: { group: null, note: 'rep 1', value: null }, A2: { group: null, note: 'rep 1', value: null }, A3: { group: null, note: 'rep 1', value: null } };
  assert.deepEqual(summarizeNotes(plate).rows, [{ index: 0, note: 'rep 1' }]);
});
