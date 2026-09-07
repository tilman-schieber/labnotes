// Densities of the liquids a synthesis lab measures by volume, so a "20 mL of #Methanol" row can
// be turned into millimoles without anyone opening a handbook. Values are for the neat liquid
// (or the usual concentrated grade for the mineral acids) at room temperature, in g/mL.
//
// Deterministic and local on purpose: PubChem does not return density in its property table, and
// a table of fifty entries covers nearly every solvent and liquid reagent that appears in a
// notebook. Explicit extension for the test runner.

export type DensityEntry = {
  cas: string;
  name: string;
  synonyms?: string[];
  // g/mL
  density: number;
  // Something a reaction is run *in*; a volume with no equivalents defaults to the solvent role.
  isSolvent: boolean;
  // Boiling point in °C, where useful for a reflux note.
  bp?: number;
};

export const DENSITIES: DensityEntry[] = [
  { cas: '7732-18-5', name: 'Water', synonyms: ['H2O', 'deionised water', 'deionized water', 'DI water', 'distilled water'], density: 0.997, isSolvent: true, bp: 100 },
  { cas: '7789-20-0', name: 'Deuterium oxide', synonyms: ['D2O', 'heavy water'], density: 1.107, isSolvent: true, bp: 101 },
  { cas: '67-56-1', name: 'Methanol', synonyms: ['MeOH', 'methyl alcohol'], density: 0.792, isSolvent: true, bp: 65 },
  { cas: '64-17-5', name: 'Ethanol', synonyms: ['EtOH', 'ethyl alcohol', 'absolute ethanol'], density: 0.789, isSolvent: true, bp: 78 },
  { cas: '67-63-0', name: '2-Propanol', synonyms: ['isopropanol', 'iPrOH', 'i-PrOH', 'IPA', 'isopropyl alcohol', 'propan-2-ol'], density: 0.786, isSolvent: true, bp: 82 },
  { cas: '71-23-8', name: '1-Propanol', synonyms: ['n-propanol', 'propan-1-ol', 'PrOH'], density: 0.803, isSolvent: true, bp: 97 },
  { cas: '71-36-3', name: '1-Butanol', synonyms: ['n-butanol', 'butan-1-ol', 'BuOH', 'n-BuOH'], density: 0.81, isSolvent: true, bp: 118 },
  { cas: '75-65-0', name: 'tert-Butanol', synonyms: ['t-BuOH', 'tBuOH', 'tert-butyl alcohol', '2-methylpropan-2-ol'], density: 0.781, isSolvent: true, bp: 82 },
  { cas: '67-64-1', name: 'Acetone', synonyms: ['propan-2-one', 'propanone'], density: 0.784, isSolvent: true, bp: 56 },
  { cas: '75-05-8', name: 'Acetonitrile', synonyms: ['MeCN', 'ACN'], density: 0.786, isSolvent: true, bp: 82 },
  { cas: '75-09-2', name: 'Dichloromethane', synonyms: ['DCM', 'CH2Cl2', 'methylene chloride'], density: 1.326, isSolvent: true, bp: 40 },
  { cas: '67-66-3', name: 'Chloroform', synonyms: ['CHCl3', 'trichloromethane'], density: 1.489, isSolvent: true, bp: 61 },
  { cas: '865-49-6', name: 'Chloroform-d', synonyms: ['CDCl3', 'deuterochloroform'], density: 1.5, isSolvent: true, bp: 61 },
  { cas: '107-06-2', name: '1,2-Dichloroethane', synonyms: ['DCE', 'ethylene dichloride'], density: 1.253, isSolvent: true, bp: 84 },
  { cas: '109-99-9', name: 'Tetrahydrofuran', synonyms: ['THF', 'oxolane'], density: 0.889, isSolvent: true, bp: 66 },
  { cas: '96-47-9', name: '2-Methyltetrahydrofuran', synonyms: ['2-MeTHF', 'MeTHF'], density: 0.854, isSolvent: true, bp: 80 },
  { cas: '60-29-7', name: 'Diethyl ether', synonyms: ['Et2O', 'ether', 'ethyl ether'], density: 0.713, isSolvent: true, bp: 35 },
  { cas: '1634-04-4', name: 'Methyl tert-butyl ether', synonyms: ['MTBE', 'tert-butyl methyl ether', 'TBME'], density: 0.74, isSolvent: true, bp: 55 },
  { cas: '123-91-1', name: '1,4-Dioxane', synonyms: ['dioxane'], density: 1.033, isSolvent: true, bp: 101 },
  { cas: '110-71-4', name: '1,2-Dimethoxyethane', synonyms: ['DME', 'glyme', 'monoglyme'], density: 0.868, isSolvent: true, bp: 85 },
  { cas: '68-12-2', name: 'N,N-Dimethylformamide', synonyms: ['DMF', 'dimethylformamide'], density: 0.944, isSolvent: true, bp: 153 },
  { cas: '67-68-5', name: 'Dimethyl sulfoxide', synonyms: ['DMSO', 'dimethylsulfoxide'], density: 1.1, isSolvent: true, bp: 189 },
  { cas: '2206-27-1', name: 'Dimethyl sulfoxide-d6', synonyms: ['DMSO-d6'], density: 1.19, isSolvent: true, bp: 189 },
  { cas: '127-19-5', name: 'N,N-Dimethylacetamide', synonyms: ['DMA', 'DMAc', 'dimethylacetamide'], density: 0.937, isSolvent: true, bp: 165 },
  { cas: '872-50-4', name: 'N-Methyl-2-pyrrolidone', synonyms: ['NMP', 'N-methylpyrrolidone', '1-methyl-2-pyrrolidinone'], density: 1.028, isSolvent: true, bp: 202 },
  { cas: '108-88-3', name: 'Toluene', synonyms: ['methylbenzene', 'PhMe'], density: 0.867, isSolvent: true, bp: 111 },
  { cas: '71-43-2', name: 'Benzene', synonyms: ['PhH'], density: 0.876, isSolvent: true, bp: 80 },
  { cas: '1330-20-7', name: 'Xylenes', synonyms: ['xylene', 'mixed xylenes'], density: 0.864, isSolvent: true, bp: 139 },
  { cas: '108-90-7', name: 'Chlorobenzene', synonyms: ['PhCl'], density: 1.106, isSolvent: true, bp: 132 },
  { cas: '110-54-3', name: 'Hexane', synonyms: ['n-hexane', 'hexanes'], density: 0.655, isSolvent: true, bp: 69 },
  { cas: '142-82-5', name: 'Heptane', synonyms: ['n-heptane', 'heptanes'], density: 0.684, isSolvent: true, bp: 98 },
  { cas: '109-66-0', name: 'Pentane', synonyms: ['n-pentane'], density: 0.626, isSolvent: true, bp: 36 },
  { cas: '8032-32-4', name: 'Petroleum ether', synonyms: ['pet ether', 'petrol ether', 'ligroin'], density: 0.65, isSolvent: true, bp: 60 },
  { cas: '110-82-7', name: 'Cyclohexane', density: 0.779, isSolvent: true, bp: 81 },
  { cas: '141-78-6', name: 'Ethyl acetate', synonyms: ['EtOAc', 'EA', 'ethyl ethanoate'], density: 0.902, isSolvent: true, bp: 77 },
  { cas: '110-86-1', name: 'Pyridine', synonyms: ['py'], density: 0.982, isSolvent: true, bp: 115 },
  { cas: '75-52-5', name: 'Nitromethane', synonyms: ['MeNO2'], density: 1.137, isSolvent: true, bp: 101 },
  { cas: '107-21-1', name: 'Ethylene glycol', synonyms: ['ethane-1,2-diol', 'glycol'], density: 1.113, isSolvent: true, bp: 197 },
  { cas: '100-66-3', name: 'Anisole', synonyms: ['methoxybenzene'], density: 0.995, isSolvent: true, bp: 154 },
  { cas: '920-66-1', name: 'Hexafluoroisopropanol', synonyms: ['HFIP', '1,1,1,3,3,3-hexafluoro-2-propanol'], density: 1.596, isSolvent: true, bp: 58 },
  { cas: '64-19-7', name: 'Acetic acid', synonyms: ['AcOH', 'glacial acetic acid', 'HOAc', 'ethanoic acid'], density: 1.049, isSolvent: true, bp: 118 },
  { cas: '121-44-8', name: 'Triethylamine', synonyms: ['Et3N', 'TEA', 'NEt3'], density: 0.726, isSolvent: false, bp: 89 },
  { cas: '7087-68-5', name: 'N,N-Diisopropylethylamine', synonyms: ['DIPEA', 'DIEA', "Hünig's base", 'Hunig\'s base', 'iPr2NEt'], density: 0.742, isSolvent: false, bp: 127 },
  { cas: '6674-22-2', name: '1,8-Diazabicyclo[5.4.0]undec-7-ene', synonyms: ['DBU'], density: 1.018, isSolvent: false, bp: 261 },
  { cas: '110-89-4', name: 'Piperidine', density: 0.862, isSolvent: false, bp: 106 },
  { cas: '110-91-8', name: 'Morpholine', density: 1.007, isSolvent: false, bp: 129 },
  { cas: '108-24-7', name: 'Acetic anhydride', synonyms: ['Ac2O'], density: 1.082, isSolvent: false, bp: 140 },
  { cas: '76-05-1', name: 'Trifluoroacetic acid', synonyms: ['TFA'], density: 1.489, isSolvent: false, bp: 72 },
  { cas: '64-18-6', name: 'Formic acid', synonyms: ['HCOOH', 'methanoic acid'], density: 1.22, isSolvent: false, bp: 101 },
  { cas: '7664-93-9', name: 'Sulfuric acid', synonyms: ['H2SO4', 'sulphuric acid', 'conc. sulfuric acid', 'concentrated sulfuric acid'], density: 1.84, isSolvent: false, bp: 337 },
  { cas: '7697-37-2', name: 'Nitric acid', synonyms: ['HNO3', 'conc. nitric acid', 'nitric acid 70%'], density: 1.413, isSolvent: false, bp: 121 },
  { cas: '7647-01-0', name: 'Hydrochloric acid', synonyms: ['HCl', 'conc. HCl', 'concentrated hydrochloric acid', 'hydrochloric acid 37%'], density: 1.18, isSolvent: false },
  { cas: '7719-09-7', name: 'Thionyl chloride', synonyms: ['SOCl2'], density: 1.636, isSolvent: false, bp: 76 },
  { cas: '79-37-8', name: 'Oxalyl chloride', synonyms: ['(COCl)2'], density: 1.478, isSolvent: false, bp: 63 },
  { cas: '10025-87-3', name: 'Phosphorus oxychloride', synonyms: ['POCl3', 'phosphoryl chloride'], density: 1.645, isSolvent: false, bp: 106 },
  { cas: '75-77-4', name: 'Chlorotrimethylsilane', synonyms: ['TMSCl', 'trimethylsilyl chloride', 'Me3SiCl'], density: 0.856, isSolvent: false, bp: 57 },
  { cas: '109-63-7', name: 'Boron trifluoride diethyl etherate', synonyms: ['BF3·OEt2', 'BF3.OEt2', 'BF3 etherate', 'boron trifluoride etherate'], density: 1.15, isSolvent: false, bp: 126 },
  { cas: '546-68-9', name: 'Titanium(IV) isopropoxide', synonyms: ['Ti(OiPr)4', 'titanium tetraisopropoxide'], density: 0.96, isSolvent: false, bp: 232 },
  { cas: '74-88-4', name: 'Iodomethane', synonyms: ['MeI', 'methyl iodide'], density: 2.28, isSolvent: false, bp: 42 },
  { cas: '100-39-0', name: 'Benzyl bromide', synonyms: ['BnBr'], density: 1.438, isSolvent: false, bp: 201 },
  { cas: '106-95-6', name: 'Allyl bromide', density: 1.398, isSolvent: false, bp: 71 },
  { cas: '100-52-7', name: 'Benzaldehyde', synonyms: ['PhCHO'], density: 1.044, isSolvent: false, bp: 179 },
  { cas: '62-53-3', name: 'Aniline', synonyms: ['PhNH2', 'aminobenzene'], density: 1.022, isSolvent: false, bp: 184 },
  { cas: '108-95-2', name: 'Phenol', density: 1.07, isSolvent: false, bp: 182 },
  { cas: '56-81-5', name: 'Glycerol', synonyms: ['glycerin', 'glycerine'], density: 1.261, isSolvent: false, bp: 290 }
];

// Names are compared without case, punctuation spacing, and the grade words a chemist writes in
// front of a reagent ("conc. H2SO4", "dry THF", "anhydrous DMF", "glacial AcOH").
const GRADE_WORDS = /^(conc\.?|concentrated|dry|anhydrous|anh\.?|glacial|absolute|abs\.?|fresh(?:ly)?\s+distilled|distilled|degassed|deuterated|technical|hplc[- ]grade|reagent[- ]grade)\s+/i;

function normaliseName(value: string): string {
  return value
    .trim()
    .replace(GRADE_WORDS, '')
    .replace(GRADE_WORDS, '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s*·\s*/g, '·');
}

const BY_CAS = new Map(DENSITIES.map((entry) => [entry.cas, entry]));
const BY_NAME = new Map<string, DensityEntry>();
for (const entry of DENSITIES) {
  for (const name of [entry.name, ...(entry.synonyms ?? [])]) {
    BY_NAME.set(normaliseName(name), entry);
  }
}

export function densityByCas(cas: string | null | undefined): DensityEntry | null {
  return cas ? BY_CAS.get(cas.trim()) ?? null : null;
}

export function densityByName(label: string | null | undefined): DensityEntry | null {
  if (!label) {
    return null;
  }
  return BY_NAME.get(normaliseName(label)) ?? null;
}

// The entry for a compound, by CAS when it is known and by name otherwise.
export function densityFor({ casNumber, label }: { casNumber?: string | null; label?: string | null }): DensityEntry | null {
  return densityByCas(casNumber) ?? densityByName(label);
}

export function isKnownSolvent(labelOrCas: string | null | undefined): boolean {
  const entry = densityByCas(labelOrCas) ?? densityByName(labelOrCas);
  return entry?.isSolvent ?? false;
}
