// The reaction scheme: reactants → products, with reagents and catalysts over the arrow. Kept as
// a reaction SMILES ("A.B>C>D") so Ketcher can edit it and OpenChemLib can read it back. Built
// from the rows of a reaction table when nobody has drawn one. Pure; explicit .ts imports.
import type { ReactionComponent } from './reaction.ts';

export type SchemeParts = { reactants: string[]; agents: string[]; products: string[] };

const clean = (smiles: string | null | undefined): string | null => {
  const value = (smiles ?? '').trim();
  return value && !value.includes('>') ? value : null;
};

// Reactants and products from the rows that carry a structure; reagents and catalysts become
// agents over the arrow; solvents are left out (they go with the conditions). Null when no row
// on either side of the arrow has a structure.
export function schemeFromComponents(components: ReactionComponent[]): string | null {
  const reactants: string[] = [];
  const agents: string[] = [];
  const products: string[] = [];
  for (const component of components) {
    const smiles = clean(component.smiles);
    if (!smiles) {
      continue;
    }
    if (component.role === 'reactant') {
      reactants.push(smiles);
    } else if (component.role === 'product') {
      products.push(smiles);
    } else if (component.role === 'reagent' || component.role === 'catalyst') {
      agents.push(smiles);
    }
  }
  if (reactants.length === 0 && products.length === 0) {
    return null;
  }
  return `${reactants.join('.')}>${agents.join('.')}>${products.join('.')}`;
}

export function parseScheme(smiles: string | null | undefined): SchemeParts | null {
  if (!smiles) {
    return null;
  }
  const parts = smiles.split('>');
  if (parts.length !== 3) {
    return null;
  }
  const split = (value: string) => value.split('.').map((item) => item.trim()).filter(Boolean);
  const result = { reactants: split(parts[0]), agents: split(parts[1]), products: split(parts[2]) };
  return result.reactants.length + result.products.length > 0 ? result : null;
}

export function isEmptyScheme(smiles: string | null | undefined): boolean {
  return parseScheme(smiles) === null;
}
