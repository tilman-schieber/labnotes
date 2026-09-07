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
    entity({ type: 'compound', status: 'verified', attributes: { ...described, casNumber: '50-78-2', iupacName: 'x', pubchemCid: 2244 } }),
    {
      lookupCompound: async () => {
        throw new Error('should not be asked');
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
