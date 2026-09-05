import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeConditions, stepConditions, stepVerb } from './steps.ts';

test('imperative lab verbs start steps; narrative does not', () => {
  assert.equal(stepVerb('Add 5 mL of buffer to the tube.'), 'add');
  assert.equal(stepVerb('  Stir.'), 'stir');
  assert.equal(stepVerb('Incubate at 37 °C'), 'incubate');
  assert.equal(stepVerb('The mixture was stirred overnight.'), null);
  assert.equal(stepVerb('Addition of acid gave a precipitate'), null);
  assert.equal(stepVerb(''), null);
});

test('conditions pick the first duration and temperature', () => {
  const conditions = stepConditions([
    { value: 5, unit: 'mL' },
    { value: 10, unit: 'min' },
    { value: 60, unit: '°C' },
    { value: 2, unit: 'h' }
  ]);
  assert.deepEqual(conditions, { duration: { value: 10, unit: 'min' }, temperature: { value: 60, unit: '°C' } });
  assert.equal(describeConditions(conditions), '10 min · 60 °C');
  assert.equal(describeConditions(stepConditions([{ value: 1, unit: 'g' }])), '');
});
