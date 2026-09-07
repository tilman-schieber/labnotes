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
