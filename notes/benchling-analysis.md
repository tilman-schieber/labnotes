# Benchling vs. a notebook you type into

*Analysis, October 2026. Sources: Benchling's developer docs (data warehouse table reference, Documents and Chemistry API intros), help-center articles reachable through search, and Benchling's own 2025–2026 release notes and announcements. The help center itself blocks automated reading, so UI details there come from search excerpts and may be dated.*

## 1. What Benchling is

Benchling sells a "Life Sciences R&D Cloud" of seven applications sharing one data model: **Notebook, Molecular Biology, Registry, Inventory, Workflows, Studies, Insights**, plus **Connect** (instrument integration, formerly Lab Automation), **Benchling AI** (Ask, Compose, Data Entry and Deep Research agents, GA since February 2026) and vertical packages (Biologics, Development, Chemistry, In Vivo).

The organising idea is the opposite of ours. In Benchling, **the schema comes first**: an admin defines entity schemas, result schemas, container/box/plate/location schemas, task schemas and request schemas with typed fields, dropdowns, validation ranges and naming prefixes. Scientists then fill those schemas through **structured tables inside notebook entries**, through forms, or through instrument uploads. The entry is a document with a flat list of parts (text, headings, lists, free tables, attachments, structured tables) whose structured parts write into the Registry, Inventory and Results stores. Everything else (review, audit, warehouse, Insights, workflows) sits on top of those stores.

Our model: **the prose comes first**. The text is the record; entities, amounts, roles, steps, reactions and plates are read from it or sit inline as blocks, and the registry fills itself in behind the writer. The question is how far that model can reach into what Benchling covers, where it genuinely cannot, and where it is better.

## 2. Benchling's feature inventory, with the data model behind it

| Area | What it does | Backing model (warehouse tables) |
| --- | --- | --- |
| **Notebook** | Entries with a display ID (EXP001), authors, templates (versioned, optionally schema-based), projects and folders, review processes with stages and reviewers, witness, e-signatures (21 CFR Part 11 on Validated Cloud), audit trail, bidirectional links between entries and entities, free tables and *structured tables*: registration, mixture prep, inventory (create / transfer), results, lookup (read-only live data). Worksheets and procedures (beta) are step-by-step execution records with planned / measured / confirmation parameter values and a "creation context" that says which step produced which entity, container, plate or result. | `entry`, `entry_template(_version)`, `author`, `review_process(_version, _stage)`, `bnch$review`, `bnch$reviewer`, `bnch$worksheet`, `bnch$creation_context` |
| **Registry** | Entity schemas per type (DNA sequence, RNA, AA sequence, oligos, custom entities, molecules; mixtures with ingredients; batches with a batch schema), fields with types, multi-values, required flags, numeric ranges, dropdowns and links to other schemas; registration with a prefix + running ID, validation status, aliases, fieldsets. | `schema`, `entity_schema`, `field_definition`, `entity`, `registry_entity`, `registration_origin`, `entity_alias`, `dropdown(_option)`, `mixture(_ingredient)`, `batch(_schema)` |
| **Inventory** | Locations → boxes/plates → containers (wells are containers with row/column), each with barcode, schema, capacity; container contents (entity or batch, concentration), volumes, transfers (input/output container, volume), checkout to a user or team, sample owners and restricted parties; worklists. | `location`, `box`, `plate`, `container`, `container_content`, `container_transfer`, `sample_owner` |
| **Results & Runs** | Result schemas (typed columns, per-field validation, review status), results linked to run, entry and entity; run schemas with an analysis template; units with conversion factors. | `assay_result_schema`, `result`, `assay_run_schema`, `bnch$unit(_type)` |
| **Workflows & Requests** | Task schemas with lifecycles (status graph), tasks with assignee and an execution entry, outputs linked by lineage edges, flowcharts; requests as a schema-defined intake form. | `workflow_task(_schema, _status, _status_change, _lifecycle)`, `workflow_output`, `workflow_flowchart*`, requests tables |
| **Molecular Biology** | Sequence editor for DNA/RNA/AA with annotations, translations, primer design, CRISPR guides, alignments, digests and cloning, oligo entities, protein search (exact-match AA search added 2026). | `dna_sequence`, `rna_sequence`, `aa_sequence`, `dna_oligo`, `rna_oligo` |
| **Chemistry** | Molecules with Compound / Form (salt and solvate counterparts with ratios) schemas, Salt & Solvate Library, reactions (beta API), molecule lots. | Chemistry V3 API |
| **Connect / automation** | 160+ instrument integrations, run files processed into results, Automation Designer orchestrating samples → instruments → analysis → results from a notebook run. | runs, results |
| **Insights & warehouse** | Read-only SQL warehouse, dashboards, charts to 50k points, "Ask" over dashboards, custom code (Python/R) inside Benchling. | warehouse |
| **Benchling AI** | Ask (chat over experiments, results, attachments), Deep Research (notebook + literature, MCP connectors), **Compose** (turns protocols, notes and files into entries and templates), **Data Entry** (extracts data from PDFs, Word, spreadsheets into structured records). | — |
| **Studies** | Study designs with conditions, replicates and unit operations; reusable study templates. | `wh-studies` |
| **Admin & compliance** | Projects/folders with permissions, teams, capability management, audit logs, Validated Cloud (Part 11 / Annex 11), apps and events (webhooks, EventBridge), Python SDK. | `principal`, `project`, `folder`, events |

Two observations before the comparison:

1. **Benchling's AI roadmap is converging on our thesis.** Compose and Data Entry exist because structured tables are a chore: the agent reads free text and files and fills the schema. We do that at keystroke time, without a model, for the cases that matter most (entities, amounts, roles, conditions, steps, reaction rows). That is the feature we should keep sharpening, not apologise for.
2. **Everything in Benchling hangs off one spine: typed schemas + registered IDs.** The parts of Benchling we can approach are the ones where the schema can be inferred from the writing; the parts we cannot are the ones where the schema *is* the product (validated environments, enterprise inventory, workflow lifecycles).

## 3. Side by side

Legend: **Have** = present today; **Near** = reachable from the typed-notebook model with moderate work; **Far** = needs a different model or is out of scope.

### Notebook

| Benchling | Us | Status | How we get there, in our model |
| --- | --- | --- | --- |
| Entry with display ID, authors, project/folder | Experiment with per-project number, group/project tree, `@` author | Have | — |
| Templates, versioned, schema-based | Templates from a document, cloning | Have (partly) | Keep templates as text. Add "fill-in" blanks: `[[mass]]`, `[[strain]]` tokens that Tab jumps between; a template's blanks are its schema. |
| Free tables | TipTap tables | Have | — |
| Registration table | `#Name` creates a draft; popover/registry types it; classifier fills attributes | Have, differently | The sentence *is* the registration row. Add **"register as batch" from prose**: writing `gave 1.15 g of #Methyl benzoate` already registers through the reaction table; let the same happen for samples and strains ("picked colony → #BL21 clone 3"). |
| Mixture prep table | Reaction block (stoichiometry) | Near | A `/recipe` block = reaction block without products: components, target volume, concentrations → masses, written back as "(dissolve 2.92 g NaCl in …)". Mostly a mode of the existing block. |
| Inventory table (create containers, transfers) | Containers and locations are entities; stock on reagents/batches | Near | Sentences like "aliquoted 10 × 1 mL into #Box 7" can create container entities and consume stock. See Inventory below. |
| Results table (typed columns, validation, submit) | Plate block values; quantities in prose; usages | Near | Add a **measurement block** (`/results`): a small typed table whose columns come from what was pasted or typed, each row bound to an entity token, with a unit per column. Reuse the plate paste parser. Keep it unsubmitted-free: the document revision is the submission. |
| Lookup table / lookup columns (live registry data read-only) | Hover cards on tokens, linked-entity strip, timeline | Have (as hover, not as table) | A `/lookup` block that renders attributes of the entities mentioned in the section as a table, refreshed on open. Cheap. |
| Worksheets / procedures with planned vs measured values | Steps as list items, stamped steps, quantities | Near | Protocol mode is the seed: a template sentence "Add [[25 mg]] of #X" where the blank holds the planned value and the typed value is the measured one; keep both on the token (`planned`, `value`). Deviations are then computable and exportable. |
| Review process with stages, reviewers, witness | Sign with note, hash chain, revisions | Near | Add a *review* state per revision: request review → reviewer signs → status; two or three statuses, not a configurable stage graph. |
| 21 CFR Part 11 e-signatures, Validated Cloud | Signatures + hash chain | Far | Compliance is procedural (SOPs, validation documents, access control), not a feature. We can keep the technical preconditions (immutable revisions, signer identity, audit log) and say so. |
| Comments, @mentions in entries | `@` user tokens | Near | Comment threads anchored to a revision range; low effort with the revision model. |
| Bidirectional links entry ↔ entity | Backlinks, "Referenced in", document entities | Have | — |
| Attachments, images | Have | Have | — |
| Compose agent (text → entry) | The editor itself | Have, by design | Our tokens are the "composed" structure. Worth stating in the docs/README as a positioning line. |
| Data Entry agent (files → structured data) | Plate paste; attachments | Near | Import of instrument exports (CSV/XLSX) into the measurement block: column detection, unit guess, entity matching against tokens in the section. No LLM needed for the 80 % case. |

### Registry

| Benchling | Us | Status | How we get there |
| --- | --- | --- | --- |
| Admin-defined schemas with typed fields, dropdowns, ranges, required | Fixed types with an attribute schema per type; subtype free text | Near | Keep types fixed (they are what a chemist/biologist names) but let **attribute schemas be extended per tenant** in a config file: `{ type: 'sample', key: 'passage', kind: 'number', label: 'Passage' }`. The popover and shelves pick it up. No schema builder UI; a file is enough for a small lab. |
| Registration prefix + running ID (`p001`) | Entity IDs are opaque; batches have codes `TS-012-A` | Near | Optional per-type prefix and counter ("S-0042") shown as a secondary label; batches already do it. |
| Validation status on registration | Classifier verified/draft | Have (weaker) | Required fields per type → "incomplete" badge on the shelf; no blocking. |
| Entity types: DNA/RNA/AA sequences, oligos, plasmids | None | Far for the editor, Near for storage | Add `sequence` as a type with a sequence attribute, length, kind (DNA/RNA/AA), a plain monospace viewer with translation and simple feature annotations. A full sequence editor (primers, CRISPR, cloning) is Benchling's moat and years of work; do not attempt. Link out to the user's sequence tool instead and store the file. |
| Mixtures with ingredients | Reaction block, usages | Near | `/recipe` block above; store the result as a `reagent` with an `ingredients` attribute. |
| Batches / lots with a schema, molecule lots, salt forms | Batches with code, amount, purity, mp; stock | Have (partly) | Salt/solvate forms: add `parentCompoundId` + `counterions` attribute on compounds; MW of the form computed. Modest. |
| Aliases, dropdowns, fieldsets | Aliases, relations | Have (partly) | Dropdown values: allow `options` on an attribute field in the config above. |
| Chemistry registration with uniqueness by structure | PubChem CID / canonical structure duplicate suggestions, merge | Have | — |

### Inventory

| Benchling | Us | Status | How we get there |
| --- | --- | --- | --- |
| Location → box/plate → container hierarchy with capacity | Container and location entity types with kind/temperature/position; stock on reagents and batches | Near | Give containers a `parent` relation (box in freezer in room) and a capacity; the Storage & places shelf becomes a tree. Stock stays on the material, position on the container. |
| Barcodes on everything | None | Near | A `barcode` attribute on every type, printable labels from the registry (Code 128 SVG), and `#` lookup by scanning (a scanner types the code + Enter, which is exactly a `#` query). |
| Container contents with concentration and volume; transfers with lineage | Usages with amounts; stock consumption; "Derived from / here" | Near | Transfers in prose: "took 2 mL from #Stock A into #Tube 14" creates a container entity, a usage and a derived-from relation. This is the same recogniser as usages with two entities and a direction word. |
| Plates as inventory objects with wells as containers | Plate block in the document, groups optionally entities | Have (document-side) | Let a plate block **register itself** as a container entity ("Plate P-0007") so another experiment can reference `#P-0007` and inherit the layout. |
| Checkout, sample owners, restricted samples | None | Far (enterprise) | Skip; a small lab does not need it. |
| Worklists | None | Far | Skip; the palette and search cover ad-hoc lists. |

### Results, analysis, instruments

| Benchling | Us | Status | How we get there |
| --- | --- | --- | --- |
| Result schemas with typed columns, per-field validation, review | Plate values; quantities in prose; usages per entity | Near | Measurement block (see Notebook). Typing stays primary: a sentence "OD600 of #Culture A was 1.21" is already a result if we read "⟨measure⟩ of ⟨entity⟩ was ⟨number⟩". Add that pattern to the recogniser and show results on the entity's timeline next to usages. |
| Runs linked to entries and plates, run schemas | None | Near | A run is "this plate block + this paste"; store the raw file as an attachment linked to the block. |
| 160+ instrument integrations (Connect) | Paste and attachments | Far | Not a feature we can match broadly. Do the three that matter per lab: plate reader CSV, balance/pipette logs, HPLC export, as import parsers for the measurement block. |
| Custom code (Python/R) inside the product | None | Far | Export is our answer: PDF, Typst, the HTTP API, SQLite/Postgres directly. A documented "query your notebook from a Jupyter cell" recipe gets 80 % of the value. |
| Insights dashboards, warehouse, 50k-point charts | Registry totals per dimension, timelines | Far (as a product); Near (as a recipe) | Project page feed is the beginning of a dashboard. Add per-project summaries (experiments by status, entities most used, yields over time) rendered from existing usages; keep charts simple (sparkline SVG). |
| Experiment Optimization, Benchling Models (Boltz, AlphaFold) | None | Far | Out of scope. |

### Workflows, requests, studies

| Benchling | Us | Status | How we get there |
| --- | --- | --- | --- |
| Task schemas, lifecycles, assignees, flowcharts, lineage | Task lists in documents, status/date/tags, "Next" sections | Near (light) | Make task items first-class across documents: an **inbox view** of unchecked task items with `@assignee` and a due date token (`by 2026-10-24`), grouped by project. No lifecycle graph. |
| Requests (intake forms to core facilities) | None | Far | Skip unless a lab asks. A request is an experiment in another project with a task item pointing back. |
| Studies with conditions and replicates | Plate block groups, tags | Near (light) | A "conditions" block that lists factor levels and generates the plate groups / sample names; keep it to one block type. |

### Molecular biology

| Benchling | Us | Status | How we get there |
| --- | --- | --- | --- |
| Sequence editor, annotations, translations, primers, CRISPR, alignments, cloning, digests | None | Far | Do not build a sequence editor. Add a `sequence` entity type with a read-only viewer (monospace, 6-frame translation, length, GC %, a few annotations) and import of GenBank/FASTA to attributes, so a strain, plasmid or primer can be referenced with `#` and its sequence shown on hover. Link out for design work. |
| Oligos as entities | Reagents | Near | `oligo` as a subtype of sequence with Tm and scale attributes; the reagent shelf shows them. |

### Collaboration, admin, platform

| Benchling | Us | Status | How we get there |
| --- | --- | --- | --- |
| Projects, folders, teams, permissions | Groups/projects, users without auth | Far (today) | Authentication and per-group permissions are prerequisites for anything multi-lab. This is the largest gap that has nothing to do with the writing model. |
| Audit trail | Revisions with hash chain | Have (partly) | Add an append-only event log for entity edits, merges and signatures; the revisions already cover documents. |
| REST API, Python SDK, webhooks, apps | HTTP API, share links | Have (partly) | Document the API; add a `labnotes:document-saved` webhook mirror server-side. |
| Ask / Deep Research over the notebook | Search, palette | Near | Full-text search already exists; an LLM "ask" over documents + registry is a thin layer if we want it. Not core. |

## 4. Where our model is better, and should say so

1. **No data-entry tax.** Benchling needs Compose and Data Entry agents to make its structured tables bearable. We need neither: entities, amounts, roles, conditions and steps are read as they are typed, and the reaction and plate blocks are filled from the sentence above.
2. **The document is the record.** In Benchling a result lives in a results table that must be *submitted*; a registration row must be *registered*. Here the revision is the submission. Fewer states, fewer "unsubmitted rows" warnings, and the signed PDF is exactly what was written.
3. **Chemistry on the page.** Stoichiometry, yields written back into the sentence, scheme drawn from the rows, hazards on hover, batch registration from a product row. Benchling's reactions API is still beta.
4. **Low ceremony for a small lab.** No schema builder, no tenant admin, no capability management. Types are plain words a scientist uses.

## 5. Where we cannot compete, and should not try

- A sequence editor and molecular-biology toolbox.
- Broad instrument connectivity.
- Validated-environment compliance as a product (Part 11 / Annex 11).
- Enterprise inventory (checkout, restricted samples, worklists) and configurable workflow lifecycles.
- A warehouse-plus-BI stack.

The honest positioning: *a notebook for a research lab that wants to write, with the registry, stoichiometry, plates and PDF record falling out of the writing; connect it to the heavy tools (sequence design, instruments, BI) by file and API rather than replacing them.*

## 6. Proposed next steps, ordered by value for effort

1. **Results in prose and a measurement block** (Results, Data Entry): recognise "⟨measure⟩ of ⟨entity⟩ = ⟨number unit⟩", a `/results` block with pasted or imported columns bound to tokens, results on the entity timeline. Reuses the plate paste parser and usages.
2. **Planned vs measured on templates** (Worksheets): fill-in blanks in templates, the typed value overwriting the planned value while keeping it; a deviation list per experiment.
3. **Containers and transfers from sentences** (Inventory): parent relations on containers, barcode attribute with printable labels, "from #A into #B" recogniser, plate blocks registering themselves as containers.
4. **Per-tenant attribute schemas in a config file** (Registry): extra fields, dropdown options, required flags per type; shelves and popover pick them up.
5. **Review state and comments** (Notebook compliance-lite): request review, reviewer signature, comment threads on revisions, entity audit log.
6. **Task inbox** (Workflows-lite): unchecked task items across documents with `@assignee` and a due-date token.
7. **Sequence entities with a viewer** (Molecular Biology-lite): GenBank/FASTA import, hover shows the map, no editing.
8. **Authentication and group permissions**: the gap that blocks every multi-user deployment; independent of the writing model.
9. **Project summaries** (Insights-lite): status counts, most-used entities, yield trends on the project page.

Items 1–4 extend the typing model directly and would let a chemistry or microbiology lab cover most of what they use Benchling's Notebook, Registry and Inventory for. Items 5–8 are the gap a group leader will ask about first. Item 9 is cheap once 1 exists.
