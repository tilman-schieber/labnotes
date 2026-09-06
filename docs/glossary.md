# Glossary

**Alias** — another name for an entity (synonym, short name, code). Counts for `#` search and recognition. → [Entities](entities.md#aliases)

**Attachment** — a file stored with a document; bytes on disk, metadata and SHA-256 in the database. Images can be inserted into the text. → [Writing](writing.md#images-and-attachments)

**Attribute** — a key in an entity's JSON; known keys per type get form fields. → [Entities](entities.md#attributes)

**Backlink / Referenced in** — the documents that reference an entity, from the mention index.

**Book** — the PDF export of a project or group: chapters per experiment, entity index, structure pages. → [Export](export.md#project-and-group-books)

**Chain hash** — the hash recorded at signing that includes the previously signed revision's chain hash; makes signatures tamper-evident. → [History](history.md#the-hash-chain)

**Component** — one row of a reaction table: role, compound, MW, amounts. → [Chemistry](chemistry.md#reaction-tables)

**Compound** — an entity type with chemistry: SMILES, structure, computed properties. → [Chemistry](chemistry.md#compounds)

**Content hash** — SHA-256 of a revision's canonical title and content. → [History](history.md#the-hash-chain)

**Document** — any node of the notebook tree: group, project or experiment. Each has text, a title and a mirrored document entity.

**Document entity** — the entity that mirrors a document so it can be referenced with `#`. → [Entities](entities.md#document-entities)

**Draft** — an entity created inline with `#` that the registry did not know; type `unclassified`, status `draft`, until reconciled. → [Entities](entities.md#drafts)

**Equivalents (eq)** — molar ratio relative to the limiting reagent. Typed as `2 eq` in text or entered in the table.

**Experiment** — the leaf document: one notebook entry, the German *Laborprotokoll*. Lives in a project.

**Expiry** — a reagent attribute (date); drives *expired* / *expiring soon* badges. → [Entities](entities.md#attributes)

**Group** — the top level of the tree; holds projects.

**Hover card** — the card shown over an entity token: type, structure, stock, expiry, reference count.

**IDCode** — OpenChemLib's canonical structure identifier, used to detect duplicate compounds.

**Limiting reagent** — the reactant everything is computed relative to; first with an amount, or marked "lim.". → [Chemistry](chemistry.md#what-the-table-computes)

**Mention / Reference** — an entity or user token in a document. Indexed as `document_mentions`.

**Metadata** — an experiment's status, date and tags, kept outside the text. → [Writing](writing.md#metadata-status-date-tags)

**Palette** — the `/` command list. → [Writing](writing.md#the--palette)

**Project** — the middle level of the tree; holds experiments.

**Quantity token** — a value with a unit as one inline chip (`25 mg`). Bound to nearby references to form usages. → [Writing](writing.md#quantities)

**Reaction table** — a block computing stoichiometry from its rows, pre-filled from the section above. → [Chemistry](chemistry.md#reaction-tables)

**Recognition** — underlining of plain-text names and amounts that could be tokens; nothing changes until you click or use the shortcuts. → [Writing](writing.md#recognition-names-and-amounts-you-did-not-tokenise)

**Registry** — the Entities view: the list of everything you can reference, with details. → [Entities](entities.md)

**Relation** — a typed link between two entities (`uses`, `derived_from`, `stored_in`, `references`, `belongs_to`). → [Entities](entities.md#relations)

**Revision** — a stored snapshot of a document's title and content; saves within two minutes fold into one. → [History](history.md#revisions)

**Role** — a usage's or component's part in a reaction: reactant, reagent, solvent, product. Read from wording (*in*, *gave*, …). → [Chemistry](chemistry.md#where-the-rows-come-from)

**Search text** — the flattened text of a document kept for full-text search; derived on save.

**Section** — the text since the previous heading; the part of a document a reaction table reads.

**Share link** — a public, read-only URL to a signed revision. → [History](history.md#share-links)

**Signature** — a user's sign-off on a revision, with time and note; freezes the revision. → [History](history.md#signing)

**SMILES** — the line notation for a molecular structure that compounds store. → [Chemistry](chemistry.md#compounds)

**Step** — a top-level paragraph starting with an instruction verb; numbered and listed with its conditions. → [Writing](writing.md#steps)

**Stock recorded** — a reagent attribute: the amount on hand when written down; usages since are subtracted. → [Entities](entities.md#attributes)

**Template** — saved experiment content used as the starting point of new experiments. → [Writing](writing.md#templates)

**Timestamp token** — an inline instant shown as a time (`14:32`). → [Writing](writing.md#timestamps)

**Timeline** — an entity's usages in experiment-date order with running totals. → [Entities](entities.md#usages)

**Typst** — the typesetting system used for PDF export. → [Export](export.md)

**Usage** — one entity in one sentence with its bound amounts and role; derived on save. → [Entities](entities.md#usages)

**Verify** — recomputing a document's signature chain and reporting each signed revision as verified or tampered. → [History](history.md#the-hash-chain)
