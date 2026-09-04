// Known attribute keys per entity type. Anything else stays editable as raw JSON.
export type AttributeField = {
  key: string;
  label: string;
  kind: 'text' | 'date' | 'number' | 'quantity';
  placeholder?: string;
};

const SAMPLE_FIELDS: AttributeField[] = [
  { key: 'source', label: 'Source', kind: 'text' },
  { key: 'organism', label: 'Organism', kind: 'text' },
  { key: 'subjectId', label: 'Subject ID', kind: 'text' },
  { key: 'timepoint', label: 'Timepoint', kind: 'text' },
  { key: 'condition', label: 'Condition', kind: 'text' },
  { key: 'storage', label: 'Storage', kind: 'text', placeholder: 'e.g. -80 °C, box 3' },
  { key: 'collectedAt', label: 'Collected', kind: 'date' }
];

export const ATTRIBUTE_SCHEMA: Record<string, AttributeField[]> = {
  sample: SAMPLE_FIELDS,
  specimen: SAMPLE_FIELDS,
  reagent: [
    { key: 'vendor', label: 'Vendor', kind: 'text' },
    { key: 'catalogNumber', label: 'Catalog no.', kind: 'text' },
    { key: 'lotNumber', label: 'Lot no.', kind: 'text' },
    { key: 'concentration', label: 'Concentration', kind: 'quantity', placeholder: 'e.g. 2 M' },
    // Stock at the time of recording; usages written since are subtracted (see stock.ts).
    { key: 'amount', label: 'Stock recorded', kind: 'quantity', placeholder: 'e.g. 250 g' },
    { key: 'storage', label: 'Storage', kind: 'text' },
    { key: 'openedAt', label: 'Opened', kind: 'date' },
    { key: 'expiry', label: 'Expiry', kind: 'date' }
  ],
  compound: [
    { key: 'casNumber', label: 'CAS', kind: 'text' },
    { key: 'iupacName', label: 'IUPAC name', kind: 'text' },
    { key: 'density', label: 'Density (g/mL)', kind: 'number' },
    { key: 'meltingPoint', label: 'Melting point', kind: 'quantity', placeholder: 'e.g. 135 °C' },
    { key: 'boilingPoint', label: 'Boiling point', kind: 'quantity', placeholder: 'e.g. 140 °C' },
    { key: 'hazards', label: 'Hazards', kind: 'text', placeholder: 'GHS statements' }
  ],
  instrument: [
    { key: 'manufacturer', label: 'Manufacturer', kind: 'text' },
    { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serialNumber', label: 'Serial no.', kind: 'text' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'lastCalibration', label: 'Last calibration', kind: 'date' },
    { key: 'nextCalibration', label: 'Next calibration', kind: 'date' }
  ],
  container: [
    { key: 'kind', label: 'Kind', kind: 'text', placeholder: 'freezer, box, shelf…' },
    { key: 'temperature', label: 'Temperature', kind: 'quantity', placeholder: 'e.g. -20 °C' },
    { key: 'position', label: 'Position', kind: 'text', placeholder: 'e.g. shelf 2, box A3' }
  ],
  location: [
    { key: 'building', label: 'Building', kind: 'text' },
    { key: 'room', label: 'Room', kind: 'text' }
  ]
};

// Keys that a type's panel or the chemistry panel manages elsewhere; hidden from the raw JSON editor.
export const MANAGED_KEYS = new Set(['smiles', 'idCode', 'formula', 'molecularWeight', 'exactMass', 'logP', 'tpsa', 'hDonors', 'hAcceptors', 'pubchemCid']);

export type ExpiryState = 'expired' | 'soon' | null;

const SOON_DAYS = 30;

export function expiryState(attributes: Record<string, unknown> | null | undefined, now = new Date()): ExpiryState {
  const raw = attributes?.expiry;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const expiry = new Date(`${raw}T00:00:00`);
  const days = (expiry.getTime() - now.getTime()) / 86_400_000;
  if (days < 0) {
    return 'expired';
  }
  return days <= SOON_DAYS ? 'soon' : null;
}
