import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DENSITIES, densityByCas, densityByName, densityFor, isKnownSolvent } from './densities.ts';

test('every entry has a CAS number, a positive density and a unique name', () => {
  const names = new Set<string>();
  for (const entry of DENSITIES) {
    assert.match(entry.cas, /^\d{2,7}-\d{2}-\d$/, entry.name);
    assert.ok(entry.density > 0 && entry.density < 3, entry.name);
    assert.ok(!names.has(entry.name.toLowerCase()), `duplicate ${entry.name}`);
    names.add(entry.name.toLowerCase());
  }
});

test('lookup by CAS and by name or synonym, ignoring case and grade words', () => {
  assert.equal(densityByCas('67-56-1')?.name, 'Methanol');
  assert.equal(densityByName('methanol')?.density, 0.792);
  assert.equal(densityByName('MeOH')?.cas, '67-56-1');
  assert.equal(densityByName('dry THF')?.name, 'Tetrahydrofuran');
  assert.equal(densityByName('conc. H2SO4')?.name, 'Sulfuric acid');
  assert.equal(densityByName('anhydrous DMF')?.name, 'N,N-Dimethylformamide');
  assert.equal(densityByName('glacial acetic acid')?.name, 'Acetic acid');
  assert.equal(densityByName('Benzoic acid'), null);
  assert.equal(densityByName(''), null);
  assert.equal(densityByName(null), null);
});

test('CAS wins over the name, and the name is the fallback', () => {
  assert.equal(densityFor({ casNumber: '75-09-2', label: 'the chlorinated stuff' })?.name, 'Dichloromethane');
  assert.equal(densityFor({ casNumber: null, label: 'EtOAc' })?.name, 'Ethyl acetate');
  assert.equal(densityFor({ casNumber: '50-00-0', label: 'Formaldehyde' }), null);
});

test('solvents are flagged, liquid reagents are not', () => {
  assert.equal(isKnownSolvent('toluene'), true);
  assert.equal(isKnownSolvent('67-56-1'), true);
  assert.equal(isKnownSolvent('Et3N'), false);
  assert.equal(isKnownSolvent('sulfuric acid'), false);
  assert.equal(isKnownSolvent('Aspirin'), false);
});
