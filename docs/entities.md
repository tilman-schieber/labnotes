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

Most drafts never need any of this: the classifier below gets to them first.

<!-- screenshot: the reconciliation panel with a merge suggestion and the type picker -->

## Filling entities in automatically

Classifying every name by hand is busywork, so the server does it in the background. It runs at
startup, whenever a draft is created while writing, and every couple of minutes after that. Two
deterministic sources, in this order:

1. **The name.** The head noun decides: *Lysis Buffer* → reagent, *Eppendorf tubes* → container,
   *Tecan plate reader* → instrument, *Room 214* → location, *Sample A* → sample. Two-word heads
   win over their last word, so a plate reader is an instrument and a 96-well plate is a container.
2. **PubChem.** Anything the name does not settle is looked up by name (or by the CAS number
   already on the entity). A hit makes it a compound and fills in CAS number, IUPAC name, PubChem
   CID, structure, formula, molecular and exact mass, logP, TPSA and H-bond donors/acceptors.
   A 404 means it is not a substance, and the entity is left alone.

The same pass fills the blanks on entities that are *already* classified: a compound that has a
structure but no formula gets one computed locally, and one without a CAS number gets it looked up.

The same pass also asks PubChem's view service for the **GHS classification** of every compound with a PubChem CID — signal word, pictogram codes and H-statements — and stores the summary as `attributes.ghs` (`null` once looked up with nothing found). Hover cards, reaction rows, the compound page and the PDF show it. Set `AUTO_CLASSIFY_GHS=false` where nothing may leave the network; the service is often busy, in which case the attempt is noted and repeated hours later.

**Duplicates.** When a classified entity turns out to have the same PubChem record or the same canonical structure as an existing compound, the two are one substance. A draft, or an entry the classifier itself filled in, is merged into the existing entry on the spot — references rewritten, the extra name kept as an alias, the survivor stamped `autoClassify.via = "merge"` with what was merged. Two entries that people verified by hand are never merged automatically; the registry lists them under **Possible duplicates** with a button per name to keep.

Three rules make this safe to leave running:

- **Nothing you typed is ever overwritten.** Only empty fields are filled.
- **Everything is stamped.** A filled entity carries `attributes.autoClassify` with the source
  (`name`, `pubchem` or `structure`), what was matched, and when. The detail form shows this as a
  line under the attributes, so an automatic fill is never mistaken for a checked one.
- **It gives up.** A name PubChem does not know is recorded as a miss and retried at most three
  times, hours apart, rather than on every pass. Those are the entities that genuinely need a
  person, and they stay drafts.

**Classify automatically** next to the draft nudge runs a pass immediately. Set `AUTO_CLASSIFY=false`
to turn the background worker off (see [Data](data.md#environment)); the button still works.

## Batches

A **batch** is a particular lot of a compound: the material one experiment isolated, or a bottle that was bought. The compound is the substance; the batch is what sits on the shelf. Batches are entities of type `batch`, linked to their compound by a `belongs_to` relation and to the batches they were made from by `derived_from`, so the graph section walks a synthesis backwards and forwards.

- **Registering.** In a reaction table, a product row with an isolated mass shows **Register batch**. One click creates the batch under the compound, coded after the experiment and the writer — `TS-012-A`, then `-B`, `-C` … for further products of the same experiment — with the isolated mass as its stock, the row's purity, and the batches consumed in the table as its precursors. Bought material is created in the registry as a `batch` with vendor, lot and expiry, then linked to its compound with a `belongs_to` relation.
- **Using.** The compound picker in a reaction table lists batches next to compounds (`TS-012-A · batch of Aspirin · 1.15 g · Exp 012`). Picking one fills the row from the compound and remembers the lot; the mass or volume in that row is a usage of the batch, so its stock goes down. `#TS-012-A` in prose works the same way.
- **Batch page.** Structure (from the compound), code, where it was made, stock left, appearance and purity, precursors, the analytics mirrored from the experiments that describe it, and the files linked to it.
- **Analytics** live in the experiment as an [analytics block](chemistry.md#analytics), not on the batch: they are part of the signed record. The batch shows a read-only mirror, refreshed on every save.

## Document entities

Every group, project and experiment is mirrored as an entity of type `document` so it can be referenced with `#`. Their label and type follow the document; edit the title in the notebook. They appear in the registry but cannot be merged or deleted there.
