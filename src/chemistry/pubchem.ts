// PubChem PUG REST lookups run from the browser (PubChem serves CORS headers).
const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

export type PubChemResult = {
  cid: number;
  smiles: string;
  formula: string;
  molecularWeight: number;
  iupacName: string | null;
  casNumber: string | null;
};

const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Not found in PubChem' : `PubChem request failed (${response.status})`);
  }
  return response.json();
}

type PropertyRow = Record<string, string | number | undefined> & { CID: number };

// PubChem renamed IsomericSMILES to SMILES in 2025; ask for the new name first and fall back.
async function fetchProperties(name: string): Promise<PropertyRow> {
  const encoded = encodeURIComponent(name.trim());
  const attempts = ['SMILES', 'IsomericSMILES'];

  let lastError: unknown = null;
  for (const smilesProperty of attempts) {
    try {
      const payload = (await fetchJson(
        `${PUG}/compound/name/${encoded}/property/${smilesProperty},MolecularFormula,MolecularWeight,IUPACName/JSON`
      )) as { PropertyTable?: { Properties?: PropertyRow[] } };
      const row = payload.PropertyTable?.Properties?.[0];
      if (row) {
        return row;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith('Not found')) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('PubChem lookup failed');
}

async function fetchCas(cid: number): Promise<string | null> {
  try {
    const payload = (await fetchJson(`${PUG}/compound/cid/${cid}/synonyms/JSON`)) as {
      InformationList?: { Information?: { Synonym?: string[] }[] };
    };
    const synonyms = payload.InformationList?.Information?.[0]?.Synonym ?? [];
    return synonyms.find((synonym) => CAS_PATTERN.test(synonym)) ?? null;
  } catch {
    return null;
  }
}

export async function lookupCompound(nameOrCas: string): Promise<PubChemResult> {
  const row = await fetchProperties(nameOrCas);
  const smiles = String(row.SMILES ?? row.IsomericSMILES ?? row.ConnectivitySMILES ?? '');
  if (!smiles) {
    throw new Error('PubChem returned no structure');
  }

  return {
    cid: row.CID,
    smiles,
    formula: String(row.MolecularFormula ?? ''),
    molecularWeight: Number(row.MolecularWeight ?? 0),
    iupacName: row.IUPACName ? String(row.IUPACName) : null,
    casNumber: CAS_PATTERN.test(nameOrCas.trim()) ? nameOrCas.trim() : await fetchCas(row.CID)
  };
}
