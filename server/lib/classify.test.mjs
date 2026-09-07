import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyByName, planClassification } from './classify.mjs';

test('the head noun of a name settles the type', () => {
  assert.deepEqual(classifyByName('Lysis Buffer'), { type: 'reagent', matched: 'buffer' });
  assert.deepEqual(classifyByName('LB broth'), { type: 'reagent', matched: 'broth' });
  assert.deepEqual(classifyByName('centrifuge tube'), { type: 'container', matched: 'tube' });
  assert.deepEqual(classifyByName('Eppendorf tubes'), { type: 'container', matched: 'tube' });
  assert.deepEqual(classifyByName('Sample A'), { type: 'sample', matched: 'sample' });
  assert.deepEqual(classifyByName('Room 214'), { type: 'location', matched: 'room' });
});

test('a two-word head beats its last word alone', () => {
  assert.deepEqual(classifyByName('Tecan plate reader'), { type: 'instrument', matched: 'plate reader' });
  assert.deepEqual(classifyByName('96-well plate'), { type: 'container', matched: 'plate' });
  assert.deepEqual(classifyByName('fume hood 3'), { type: 'location', matched: 'hood' });
});

test('names that say nothing are left alone', () => {
  assert.equal(classifyByName('Aspirin'), null);
  assert.equal(classifyByName('brand new thing'), null);
  assert.equal(classifyByName(''), null);
  assert.equal(classifyByName(null), null);
});

const entity = (overrides = {}) => ({ id: 'entity-1', type: 'unclassified', status: 'draft', label: 'Aspirin', attributes: {}, ...overrides });

const aspirin = {
  cid: 2244,
  smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
  formula: 'C9H8O4',
  molecularWeight: 180.16,
  iupacName: '2-acetyloxybenzoic acid',
  casNumber: '50-78-2'
};

test('a name PubChem knows becomes a compound with its chemistry', async () => {
  const plan = await planClassification(entity(), { lookupCompound: async () => aspirin });
  assert.equal(plan.type, 'compound');
  assert.equal(plan.status, 'verified');
  assert.equal(plan.attributes.casNumber, '50-78-2');
  assert.equal(plan.attributes.formula, 'C9H8O4');
  assert.equal(plan.attributes.pubchemCid, 2244);
  assert.ok(plan.attributes.smiles);
  assert.ok(plan.attributes.molecularWeight > 180 && plan.attributes.molecularWeight < 181);
  assert.deepEqual(plan.provenance.via, 'pubchem');
});

test('a name the keywords place never reaches PubChem', async () => {
  let asked = false;
  const plan = await planClassification(entity({ label: 'Lysis Buffer' }), {
    lookupCompound: async () => {
      asked = true;
      return aspirin;
    }
  });
  assert.equal(plan.type, 'reagent');
  assert.equal(plan.provenance.via, 'name');
  assert.equal(asked, false);
});

test('a name nothing recognises stays unclassified', async () => {
  const plan = await planClassification(entity({ label: 'brand new thing' }), {
    lookupCompound: async () => {
      throw new Error('Not found in PubChem');
    }
  });
  assert.equal(plan, null);
});

test('values a person entered are never overwritten', async () => {
  const plan = await planClassification(
    entity({ type: 'compound', status: 'verified', attributes: { casNumber: '50-78-2', iupacName: 'the name we use here' } }),
    { lookupCompound: async () => aspirin }
  );
  assert.equal(plan.attributes.iupacName, 'the name we use here');
  assert.equal(plan.attributes.casNumber, '50-78-2');
  // ... but the blanks are filled.
  assert.equal(plan.attributes.formula, 'C9H8O4');
  assert.equal(plan.status, 'verified');
});

test('a compound that already has a structure is completed without a lookup', async () => {
  let asked = false;
  const plan = await planClassification(
    entity({ type: 'compound', status: 'verified', attributes: { casNumber: '50-78-2', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' } }),
    {
      lookupCompound: async () => {
        asked = true;
        return aspirin;
      }
    }
  );
  assert.equal(asked, false, 'the formula follows from the structure already on the entity');
  assert.equal(plan.provenance.via, 'structure');
  assert.equal(plan.attributes.formula, 'C9H8O4');
  assert.equal(plan.attributes.hDonors, 1);
});

test('a compound with nothing left to fill is left alone', async () => {
  const described = await (await import('../../src/chemistry/molecule.ts')).describeSmiles('CC(=O)OC1=CC=CC=C1C(=O)O');
  const complete = await planClassification(
    entity({ type: 'compound', status: 'verified', attributes: { ...described, casNumber: '50-78-2', iupacName: 'x', pubchemCid: 2244, ghs: null } }),
    {
      lookupCompound: async () => {
        throw new Error('should not be asked');
      },
      lookupHazards: async () => {
        throw new Error('hazards already recorded');
      }
    }
  );
  assert.equal(complete, null);
});

test('a stored CAS is a better query than the display name', async () => {
  const asked = [];
  await planClassification(entity({ type: 'compound', status: 'verified', label: 'our house acid', attributes: { casNumber: '50-78-2' } }), {
    lookupCompound: async (term) => {
      asked.push(term);
      return aspirin;
    }
  });
  assert.deepEqual(asked, ['50-78-2']);
});

test('network trouble is raised, not recorded as a miss', async () => {
  await assert.rejects(
    planClassification(entity(), {
      lookupCompound: async () => {
        throw new Error('fetch failed');
      }
    }),
    /fetch failed/
  );
});

test('a liquid the density table knows gets its density and solvent flag, from CAS or from name', async () => {
  const methanol = { cid: 887, smiles: 'CO', formula: 'CH4O', molecularWeight: 32.04, iupacName: 'methanol', casNumber: '67-56-1' };
  const plan = await planClassification(entity({ label: 'MeOH' }), { lookupCompound: async () => methanol });
  assert.equal(plan.type, 'compound');
  assert.equal(plan.attributes.density, 0.792);
  assert.equal(plan.attributes.solvent, true);

  const known = entity({ type: 'compound', status: 'verified', label: 'Sulfuric acid', attributes: { casNumber: '7664-93-9', smiles: 'OS(=O)(=O)O', formula: 'H2O4S', molecularWeight: 98.08, exactMass: 97.9674, idCode: 'x', logP: -1, tpsa: 83, hDonors: 2, hAcceptors: 4 } });
  const filled = await planClassification(known, { lookupCompound: async () => { throw new Error('should not be asked'); } });
  assert.equal(filled.attributes.density, 1.84);
  assert.equal(filled.attributes.solvent, undefined, 'sulfuric acid is a reagent, not a solvent');
  assert.equal(filled.provenance.via, 'structure', 'the entity had a structure, so that is the provenance; the table only added the density');

  const typed = entity({ type: 'compound', status: 'verified', label: 'Methanol', attributes: { casNumber: '67-56-1', smiles: 'CO', formula: 'CH4O', molecularWeight: 32.04, density: 0.8 } });
  const kept = await planClassification(typed, { lookupCompound: async () => { throw new Error('no'); } });
  assert.equal(kept.attributes.density, 0.8, 'a density someone typed is left alone');
  assert.equal(kept.attributes.solvent, true, 'the blank solvent flag is still filled');
});

import { chooseMergeTarget, runClassificationPass } from './classify.mjs';

test('a draft or auto-filled entity is merged into an existing compound; hand-verified pairs are only suggested', () => {
  const existing = { id: 'entity-old', status: 'verified' };
  assert.deepEqual(chooseMergeTarget(entity({ status: 'draft' }), existing), { action: 'merge', targetId: 'entity-old', sourceId: 'entity-1' });
  assert.deepEqual(chooseMergeTarget(entity({ type: 'compound', status: 'verified', attributes: { autoClassify: { via: 'pubchem' } } }), existing), { action: 'merge', targetId: 'entity-old', sourceId: 'entity-1' });
  assert.deepEqual(chooseMergeTarget(entity({ type: 'compound', status: 'verified', attributes: {} }), existing), { action: 'suggest', targetId: 'entity-old' });
  // both automatic: the older entry survives
  const auto = { type: 'compound', status: 'verified', attributes: { autoClassify: { via: 'pubchem' } } };
  assert.deepEqual(chooseMergeTarget(entity({ ...auto, createdAt: '2026-01-01' }), { id: 'entity-old', ...auto, createdAt: '2026-02-01' }), { action: 'merge', targetId: 'entity-1', sourceId: 'entity-old' });
  // the hand-verified entry survives even when it is the one being classified
  assert.deepEqual(chooseMergeTarget(entity({ type: 'compound', status: 'verified', attributes: {} }), { id: 'entity-old', status: 'draft' }), { action: 'merge', targetId: 'entity-1', sourceId: 'entity-old' });
  assert.deepEqual(chooseMergeTarget(entity(), null), { action: 'none' });
  assert.deepEqual(chooseMergeTarget(entity(), { id: 'entity-1' }), { action: 'none' });
});

test('hazards are fetched once per CID and "none known" is remembered', async () => {
  let asked = 0;
  const ghs = { signalWord: 'Danger', pictograms: ['GHS05'], hStatements: [{ code: 'H314', text: 'Causes severe skin burns and eye damage' }], pCodes: [], source: 'pubchem', fetchedAt: 'now' };
  const full = entity({
    type: 'compound',
    status: 'verified',
    label: 'Sulfuric acid',
    attributes: { casNumber: '7664-93-9', smiles: 'OS(=O)(=O)O', formula: 'H2O4S', molecularWeight: 98.08, exactMass: 97.9674, idCode: 'x', logP: -1, tpsa: 83, hDonors: 2, hAcceptors: 4, density: 1.84, pubchemCid: 1118 }
  });
  const plan = await planClassification(full, { lookupCompound: async () => { throw new Error('no'); }, lookupHazards: async () => { asked += 1; return ghs; } });
  assert.equal(asked, 1);
  assert.deepEqual(plan.attributes.ghs, ghs);

  const none = await planClassification(full, { lookupCompound: async () => { throw new Error('no'); }, lookupHazards: async () => null });
  assert.equal(none.attributes.ghs, null, 'recorded as none so it is not asked again');
  const done = await planClassification(entity({ ...full, attributes: { ...full.attributes, ghs: null } }), { lookupCompound: async () => { throw new Error('no'); }, lookupHazards: async () => { throw new Error('should not ask'); } });
  assert.equal(done, null);
});

test('a busy hazard service is noted and retried later, without stopping the pass', async () => {
  const full = entity({ type: 'compound', status: 'verified', label: 'X', attributes: { casNumber: '1-11-1', smiles: 'CO', formula: 'CH4O', molecularWeight: 32.04, exactMass: 32.0262, idCode: 'x', logP: -0.36, tpsa: 20.2, hDonors: 1, hAcceptors: 1, density: 0.792, solvent: true, pubchemCid: 887 } });
  const plan = await planClassification(full, { lookupCompound: async () => { throw new Error('no'); }, lookupHazards: async () => { throw new Error('busy'); } });
  assert.ok(plan.attributes.ghsAttemptedAt, 'the attempt is remembered');
  assert.equal(plan.attributes.ghs, undefined);
  const again = await planClassification(entity({ ...full, attributes: plan.attributes }), { lookupCompound: async () => { throw new Error('no'); }, lookupHazards: async () => { throw new Error('should wait'); } });
  assert.equal(again, null, 'not asked again within the retry gap');
});
