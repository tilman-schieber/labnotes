import type { Molecule as OclMolecule } from 'openchemlib';

// OpenChemLib is large; load it on first use so the notebook itself stays light.
let oclPromise: Promise<typeof import('openchemlib')> | null = null;

export function loadOcl() {
  if (!oclPromise) {
    oclPromise = import('openchemlib');
  }
  return oclPromise;
}

// Attribute keys stored on `compound` entities. Everything but casNumber/iupacName is derived from smiles.
export type CompoundAttributes = {
  smiles?: string;
  idCode?: string;
  formula?: string;
  molecularWeight?: number;
  exactMass?: number;
  logP?: number;
  tpsa?: number;
  hDonors?: number;
  hAcceptors?: number;
  casNumber?: string;
  iupacName?: string;
};

export type MoleculeDescription = Required<
  Pick<CompoundAttributes, 'smiles' | 'idCode' | 'formula' | 'molecularWeight' | 'exactMass' | 'logP' | 'tpsa' | 'hDonors' | 'hAcceptors'>
>;

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function parseSmiles(smiles: string): Promise<OclMolecule | null> {
  const trimmed = smiles.trim();
  if (!trimmed) {
    return null;
  }

  const { Molecule } = await loadOcl();
  try {
    const molecule = Molecule.fromSmiles(trimmed);
    return molecule.getAllAtoms() > 0 ? molecule : null;
  } catch {
    return null;
  }
}

export async function describeMolecule(molecule: OclMolecule): Promise<MoleculeDescription> {
  const { MoleculeProperties } = await loadOcl();
  const formula = molecule.getMolecularFormula();
  const properties = new MoleculeProperties(molecule);

  return {
    smiles: molecule.toIsomericSmiles(),
    idCode: molecule.getIDCode(),
    formula: formula.formula,
    molecularWeight: round(formula.relativeWeight, 3),
    exactMass: round(formula.absoluteWeight, 4),
    logP: round(properties.logP, 2),
    tpsa: round(properties.polarSurfaceArea, 1),
    hDonors: properties.donorCount,
    hAcceptors: properties.acceptorCount
  };
}

export async function describeSmiles(smiles: string): Promise<MoleculeDescription | null> {
  const molecule = await parseSmiles(smiles);
  return molecule ? describeMolecule(molecule) : null;
}

const svgCache = new Map<string, string>();

export async function smilesToSvg(smiles: string, width: number, height: number): Promise<string | null> {
  const key = `${smiles}|${width}x${height}`;
  const cached = svgCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const molecule = await parseSmiles(smiles);
  if (!molecule) {
    return null;
  }

  const svg = molecule.toSVG(width, height, undefined, { autoCrop: true, autoCropMargin: 4, suppressChiralText: true });
  svgCache.set(key, svg);
  return svg;
}

export function isCompoundAttributes(value: unknown): value is CompoundAttributes {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatWeight(value: number | undefined) {
  return value === undefined ? '—' : `${value.toFixed(2)} g/mol`;
}
