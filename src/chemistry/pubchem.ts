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

// GHS classification as PubChem's PUG View reports it (aggregated from ECHA and others).
export type GhsSummary = {
  signalWord: 'Danger' | 'Warning' | null;
  // GHS01 … GHS09
  pictograms: string[];
  hStatements: { code: string; text: string }[];
  // Precautionary codes only; the texts are long and standard.
  pCodes: string[];
  source: 'pubchem';
  fetchedAt: string;
};

type ViewSection = { TOCHeading?: string; Information?: ViewInformation[]; Section?: ViewSection[] };
type ViewInformation = { Name?: string; Value?: { StringWithMarkup?: { String?: string; Markup?: { URL?: string; Extra?: string }[] }[] } };

// Pure: turns a PUG View record (any nesting) into the compact summary stored on a compound.
// Returns null when the record carries no GHS section at all.
export function parseGhs(payload: unknown): GhsSummary | null {
  const root = (payload as { Record?: ViewSection })?.Record;
  if (!root) {
    return null;
  }
  const pictograms = new Set<string>();
  const statements = new Map<string, string>();
  const pCodes = new Set<string>();
  let signalWord: GhsSummary['signalWord'] = null;
  let found = false;

  const visit = (section: ViewSection) => {
    if (section.TOCHeading === 'GHS Classification') {
      found = true;
    }
    for (const info of section.Information ?? []) {
      const strings = info.Value?.StringWithMarkup ?? [];
      if (info.Name === 'Pictogram(s)') {
        for (const item of strings) {
          for (const markup of item.Markup ?? []) {
            const match = /GHS0\d/.exec(markup.URL ?? '');
            if (match) {
              pictograms.add(match[0]);
            }
          }
        }
      } else if (info.Name === 'Signal') {
        for (const item of strings) {
          const word = (item.String ?? '').trim();
          if (word === 'Danger' || (word === 'Warning' && signalWord !== 'Danger')) {
            signalWord = word;
          }
        }
      } else if (info.Name === 'GHS Hazard Statements') {
        for (const item of strings) {
          const match = /^(H\d{3}[A-Za-z+]*)(?:\s*\([^)]*\))?:?\s*(.*?)(?:\s*\[[^\]]*\])?$/.exec((item.String ?? '').trim());
          if (match && !statements.has(match[1])) {
            statements.set(match[1], match[2].trim());
          }
        }
      } else if (info.Name === 'Precautionary Statement Codes') {
        for (const item of strings) {
          for (const code of (item.String ?? '').match(/P\d{3}(?:\+P\d{3})*/g) ?? []) {
            pCodes.add(code);
          }
        }
      }
    }
    (section.Section ?? []).forEach(visit);
  };
  visit(root);

  if (!found && pictograms.size === 0 && statements.size === 0) {
    return null;
  }
  return {
    signalWord,
    pictograms: [...pictograms].sort(),
    hStatements: [...statements].map(([code, text]) => ({ code, text })),
    pCodes: [...pCodes],
    source: 'pubchem',
    fetchedAt: new Date().toISOString()
  };
}

const PUG_VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound';

// The GHS summary for a CID, or null when PubChem has none. Throws on network trouble and on
// "server busy", so the caller retries later instead of recording a miss.
export async function lookupHazards(cid: number): Promise<GhsSummary | null> {
  const response = await fetch(`${PUG_VIEW}/${cid}/JSON?heading=GHS+Classification`, { headers: { Accept: 'application/json' } });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`PubChem view request failed (${response.status})`);
  }
  const payload = (await response.json()) as { Fault?: { Code?: string; Message?: string } };
  if (payload.Fault) {
    if (/NotFound|no data/i.test(`${payload.Fault.Code} ${payload.Fault.Message}`)) {
      return null;
    }
    throw new Error(payload.Fault.Message ?? 'PubChem view unavailable');
  }
  return parseGhs(payload);
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
