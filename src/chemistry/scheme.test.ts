import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createComponent } from './reaction.ts';
import { parseScheme, schemeFromComponents } from './scheme.ts';

test('a scheme is built from the rows with structures: reactants > agents > products, solvents left out', () => {
  const rows = [
    createComponent('reactant', { label: 'Benzoic acid', smiles: 'OC(=O)c1ccccc1' }),
    createComponent('solvent', { label: 'MeOH', smiles: 'CO' }),
    createComponent('catalyst', { label: 'H2SO4', smiles: 'OS(=O)(=O)O' }),
    createComponent('reagent', { label: 'No structure', smiles: null }),
    createComponent('product', { label: 'Methyl benzoate', smiles: 'COC(=O)c1ccccc1' })
  ];
  assert.equal(schemeFromComponents(rows), 'OC(=O)c1ccccc1>OS(=O)(=O)O>COC(=O)c1ccccc1');
  assert.equal(schemeFromComponents([createComponent('solvent', { smiles: 'CO' })]), null);
  assert.equal(schemeFromComponents([createComponent('reactant', { smiles: 'C>C>C' })]), null, 'a reaction SMILES is not a molecule');
});

test('parsing a reaction SMILES', () => {
  assert.deepEqual(parseScheme('A.B>C>D'), { reactants: ['A', 'B'], agents: ['C'], products: ['D'] });
  assert.deepEqual(parseScheme('A>>'), { reactants: ['A'], agents: [], products: [] });
  assert.equal(parseScheme('>>'), null);
  assert.equal(parseScheme('CCO'), null);
  assert.equal(parseScheme(null), null);
});
