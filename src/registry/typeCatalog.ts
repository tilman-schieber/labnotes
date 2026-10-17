// The entity types the app knows by name. The database stores types as free text, so this list
// is a convention shared by the registry (create form, draft promotion), the editor (token
// colours, hover cards) and the reaction table (what may be a row). The server keeps its own
// small lists where it needs them: the classifier's head-noun table (server/lib/classify.mjs)
// and the export's structure filters (server/lib/export.mjs, typst.mjs).

export const ENTITY_TYPES = ['sample', 'specimen', 'reagent', 'compound', 'batch', 'instrument', 'container', 'location'] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

// Types a draft can be promoted to by hand ("specimen" is a subtype of sample in practice).
export const PROMOTABLE_TYPES = ['sample', 'reagent', 'compound', 'batch', 'instrument', 'container', 'location'] as const;

// Types that carry (or point at) a chemical structure and can be rows of a reaction table: a
// compound is the substance, a batch is a particular lot of one.
export const CHEMICAL_TYPES: ReadonlySet<string> = new Set(['compound', 'batch']);

export function isChemical(type: string | null | undefined): boolean {
  return Boolean(type) && CHEMICAL_TYPES.has(type as string);
}

// Reserved types nobody picks by hand.
export const DOCUMENT_TYPE = 'document';
export const DRAFT_TYPE = 'unclassified';

// What a type is called on screen. The stored type stays the short word; this is the label.
export const TYPE_LABELS: Record<string, { singular: string; plural: string }> = {
  compound: { singular: 'Compound', plural: 'Compounds' },
  batch: { singular: 'Batch (lot)', plural: 'Batches' },
  reagent: { singular: 'Reagent', plural: 'Reagents' },
  sample: { singular: 'Sample', plural: 'Samples' },
  specimen: { singular: 'Specimen', plural: 'Specimens' },
  instrument: { singular: 'Instrument', plural: 'Instruments' },
  container: { singular: 'Container', plural: 'Containers' },
  location: { singular: 'Location', plural: 'Locations' },
  document: { singular: 'Notebook page', plural: 'Notebook pages' },
  [DRAFT_TYPE]: { singular: 'Unsorted', plural: 'Unsorted' }
};

export function typeLabel(type: string | null | undefined, plural = false): string {
  const entry = type ? TYPE_LABELS[type] : undefined;
  return entry ? (plural ? entry.plural : entry.singular) : type || 'entity';
}

// The registry is browsed by shelf, the way a lab is organised, not by abstract type. Each
// shelf covers one or more types; the first is what "new" creates there.
export type Shelf = {
  id: string;
  label: string;
  hint: string;
  types: string[];
  // Verb phrase for the create button, e.g. "New compound".
  create: string;
};

export const SHELVES: Shelf[] = [
  { id: 'chemicals', label: 'Chemicals', hint: 'compounds with a structure, and the batches (lots) made or bought of them', types: ['compound', 'batch'], create: 'New compound' },
  { id: 'reagents', label: 'Reagents & stock', hint: 'bought materials, buffers, media, kits — with vendor, lot and expiry', types: ['reagent'], create: 'New reagent' },
  { id: 'samples', label: 'Samples & organisms', hint: 'strains, cell lines, tissues, extracts and what was collected from them', types: ['sample', 'specimen'], create: 'New sample' },
  { id: 'equipment', label: 'Equipment', hint: 'instruments and their calibration', types: ['instrument'], create: 'New instrument' },
  { id: 'places', label: 'Storage & places', hint: 'freezers, boxes, shelves, rooms', types: ['container', 'location'], create: 'New container' }
];

export function shelfForType(type: string | null | undefined): Shelf | null {
  return SHELVES.find((shelf) => shelf.types.includes(type ?? '')) ?? null;
}
