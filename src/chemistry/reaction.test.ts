import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeReaction, createComponent } from './reaction.ts';

// Aspirin synthesis: salicylic acid (138.12) + acetic anhydride (102.09, d 1.08) -> aspirin (180.16)
const salicylic = createComponent('reactant', { id: 'sa', label: 'Salicylic acid', molecularWeight: 138.12, mass: { value: 2, unit: 'g' } });
const anhydride = createComponent('reactant', {
  id: 'aa',
  label: 'Acetic anhydride',
  molecularWeight: 102.09,
  volume: { value: 5, unit: 'mL' },
  density: 1.08
});
const acid = createComponent('reagent', { id: 'h', label: 'H2SO4', equivalents: 0.05, molecularWeight: 98.08 });
const aspirin = createComponent('product', { id: 'p', label: 'Aspirin', molecularWeight: 180.16 });

test('mmol from mass and MW; limiting reagent is the first reactant with an amount', () => {
  const { components, limitingId } = computeReaction([salicylic, anhydride, acid, aspirin]);
  const sa = components.find((c) => c.id === 'sa')!;
  assert.equal(limitingId, 'sa');
  assert.ok(Math.abs(sa.amountMmol! - 14.48) < 0.01, `salicylic acid mmol ${sa.amountMmol}`);
  assert.equal(sa.computedEquivalents, 1);
});

test('mmol from volume, density and MW; equivalents relative to limiting', () => {
  const { components } = computeReaction([salicylic, anhydride, aspirin]);
  const aa = components.find((c) => c.id === 'aa')!;
  assert.ok(Math.abs(aa.amountMmol! - 52.9) < 0.1, `anhydride mmol ${aa.amountMmol}`);
  assert.ok(Math.abs(aa.computedEquivalents! - 3.65) < 0.01, `anhydride eq ${aa.computedEquivalents}`);
});

test('equivalents-only reagent gets mmol and a mass suggestion', () => {
  const { components } = computeReaction([salicylic, acid, aspirin]);
  const h = components.find((c) => c.id === 'h')!;
  assert.ok(Math.abs(h.amountMmol! - 0.724) < 0.001, `acid mmol ${h.amountMmol}`);
  assert.equal(h.computedMass?.unit, 'mg');
  assert.ok(Math.abs(h.computedMass!.value - 71.0) < 0.2, `acid mass ${h.computedMass?.value}`);
});

test('product gets theoretical mass and yield from actual mass', () => {
  const isolated = { ...aspirin, actualMass: { value: 2.1, unit: 'g' } };
  const { components } = computeReaction([salicylic, anhydride, isolated]);
  const p = components.find((c) => c.id === 'p')!;
  assert.equal(p.theoreticalMass?.unit, 'g');
  assert.ok(Math.abs(p.theoreticalMass!.value - 2.609) < 0.002, `theoretical ${p.theoreticalMass?.value}`);
  assert.ok(Math.abs(p.yieldPercent! - 80.5) < 0.1, `yield ${p.yieldPercent}`);
});

test('explicit limiting flag overrides order', () => {
  const flagged = { ...anhydride, limiting: true };
  const { limitingId, components } = computeReaction([salicylic, flagged, aspirin]);
  assert.equal(limitingId, 'aa');
  assert.equal(components.find((c) => c.id === 'sa')!.isLimiting, false);
});

test('solution by volume and concentration', () => {
  const naoh = createComponent('reagent', { id: 'n', label: 'NaOH', volume: { value: 10, unit: 'mL' }, concentration: { value: 2, unit: 'M' } });
  const { components } = computeReaction([salicylic, naoh]);
  assert.equal(components.find((c) => c.id === 'n')!.amountMmol, 20);
});

test('nothing known yields nulls rather than NaN', () => {
  const empty = createComponent('reactant', { id: 'e', label: 'Unknown' });
  const { components, limitingId } = computeReaction([empty, aspirin]);
  assert.equal(limitingId, null);
  assert.equal(components[0].amountMmol, null);
  assert.equal(components[1].theoreticalMass, null);
  assert.equal(components[1].yieldPercent, null);
});
