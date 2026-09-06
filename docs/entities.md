# Entities & registry

Everything you can reference with `#` is an **entity**. The **Entities** view is the registry: a filterable list on the left, the selected entity's details on the right.

## Types and statuses

Types are free text, but the registry offers `sample`, `specimen`, `reagent`, `compound`, `instrument`, `container`, `location`; `document` is reserved for the mirrored notebook tree and `unclassified` for drafts. A `subtype` refines the type (e.g. sample / tissue).

| Status | Meaning |
| --- | --- |
| `draft` | created inline with `#`; not classified yet |
| `verified` | a real, curated entry |
| `archived` | kept for history; hidden from `#` suggestions and recognition |

## Attributes

Attributes are a JSON object on every entity. Known keys per type get proper fields above the raw JSON editor:

| Type | Fields |
| --- | --- |
| sample / specimen | source, organism, subject id, timepoint, condition, storage, collected (date) |
| reagent | vendor, catalog no., lot no., concentration, **stock recorded**, storage, opened, **expiry** |
| compound | CAS, IUPAC name, density, melting/boiling point, hazards — plus the [chemistry](chemistry.md#compounds) keys |
| instrument | manufacturer, model, serial no., location, last/next calibration |
| container | kind, temperature, position |
| location | building, room |

Anything else stays editable as JSON.

**Expiry** (a date) makes the entity show *expired* or *expiring within 30 days* in the list, on the hover card in the editor, and lets the list be filtered to expiring items.

**Stock recorded** (a quantity such as `250 g` or `1 L`) is the amount on hand when you wrote it down. Every usage of that entity since is subtracted (same dimension: mass, volume or amount of substance), so the registry and the hover card show what is left, with *running low* under 10 % and *used up* at zero. Update the attribute when you restock.

## Aliases

Aliases are other names for the same entity — short names, synonyms, catalogue codes. They count for `#` search and for recognition underlines (three characters or more). Merging an entity keeps its label as an alias of the survivor.

Document entities carry their title as a `title` alias automatically.

## Relations

Entities can be linked with typed relations: `uses`, `derived_from`, `stored_in`, `references`, `belongs_to`. Add one in the Relations section by picking the other entity; relations are shown from both sides. A relation may remember the document it came from.

`derived_from` is special: the **Around this entity** section walks it two hops in each direction — what this sample was derived from, and what was derived from it.

## Usages

A usage is one entity in one sentence, with the amounts bound to it and its role (reactant, product, solvent, or none). They are derived on every save from the prose (see [Quantities](writing.md#quantities) for the binding rules), never edited.

In the registry an entity shows:

- **Totals** per dimension across all documents;
- a **Timeline**: every usage in experiment-date order (the experiment's date field, else its creation date) with the running total after each; the sentence is on hover;
- **Stock**, when a stock is recorded — see above.

## Around this entity

- **Used together with** — every other entity referenced in the same documents, with how many documents they share; click to jump.
- **Derived from / Derived here** — the `derived_from` lineage, two hops each way.
- **Referenced in** — every document with a reference, opening the document.

## Merging

Two entries for the same thing are merged from the one to be removed: **Merge into another entity**, search the survivor, confirm. Then:

- every document referencing the removed entity is rewritten to the survivor (each as a new revision);
- aliases move over and the removed label becomes an alias;
- relations are re-pointed, dropping duplicates and self-loops;
- the removed entity is deleted.

Compounds with an identical structure get a shortcut to this in the compound panel. Document entities cannot be merged.

## Drafts

Creating `#Some new name` while writing makes a draft. The registry shows a nudge with the number of drafts; clicking it (or filtering by status *draft*) opens the **reconciliation panel**. For each draft:

- suggested matches among existing entities — same name, alias, one name containing the other, a near spelling, or mostly shared words — each a one-click **merge**;
- a type picker with **Keep as new**, which classifies the draft and marks it verified;
- **Delete**, only when nothing references it any more (referenced drafts must be merged so documents never point at nothing).

Changing a draft's type in the detail form has the same effect as Keep as new.

<!-- screenshot: the reconciliation panel with a merge suggestion and the type picker -->

## Document entities

Every group, project and experiment is mirrored as an entity of type `document` so it can be referenced with `#`. Their label and type follow the document; edit the title in the notebook. They appear in the registry but cannot be merged or deleted there.
