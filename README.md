# Lab Notebook Prototype

Single-page lab notebook built with Vite, React, TypeScript, TipTap, and a Postgres-backed API.

## Stack

- Vite
- React + TypeScript
- TipTap (`StarterKit`, `Table`, `Mention`)
- Express API
- Postgres
- SQL migrations and database tooling

## MVP Features

- Rich text editing:
  - Paragraphs, headings, bold, italic, bullet lists
  - Fixed document structure: first block is always editable `h1`
- Markdown-style shortcuts:
  - `*italic*`, `_italic_`, `**bold**`, `__bold__`
  - `#` to `######` headings
  - `- ` / `+ ` / `* ` for bullet lists
  - `$...$` inline math and `$$...$$` block math
- Basic tables (insert and edit)
- Reaction block (toolbar "Reaction"): stoichiometry table with reactant/reagent/solvent/product rows. Compounds are picked from the registry (MW auto-filled, structure shown); enter mass, or volume + concentration, or volume + density, or just equivalents. Computes mmol, equivalents vs. the limiting reagent, required masses, theoretical yield and % yield from the isolated mass. Component compounds count as references (backlinks).
- The document always ends with an empty paragraph, and clicking below the content places the caret at the end
- Quantities: typing `12.5 mL `, `-20 °C `, `2 eq ` turns into a unit-aware token (hover shows conversions, double-click edits, Backspace right after undoes). Units: g/L/mol/M with n/µ/m/k prefixes, °C/K, s/min/h/d, eq, %
- Rich references:
  - `#` entity references backed by the server entity registry
  - writing never waits for the registry: `#` matches multi-word names (`#Lysis buff` → Lysis Buffer), Tab or Enter accepts, Escape leaves plain text, and Enter on no match creates an *unclassified draft* on the spot. Drafts are typed later in the registry (a nudge shows how many are waiting; picking a type promotes the draft to verified)
  - `@` user references backed by the server user registry
  - documents (groups, projects, experiments) are referenced with `#` like any other entity; they render in the document colour
  - `/` is the command palette: timestamp, date, headings, lists, task list, table, reaction, formula, quote, divider — filter by typing, Enter/Tab to run
  - timestamp tokens (`/time` or Ctrl/Cmd+Shift+T) insert the current time and keep the full instant for hover/export
  - `#` suggestions rank entities recently used in the current project first
- Sidebar tree structure:
  - Groups -> Projects -> Experiments
- Create actions:
  - New Group
  - New Project (inside selected group)
  - New Experiment (inside selected project)
- Templates: "Save as template" on an experiment; "New from template…" in the sidebar (delete from the same menu)
- Linked entities strip under the editor: everything the document references (from the mention index), grouped by type; click opens the entity in the registry or the referenced document
- Attachments: any file can be attached to a document (panel above the editor); images pasted or dropped into the text are uploaded and placed inline, and appear in the PDF export. Bytes live under `ATTACHMENTS_DIR` (default `data/attachments`, git-ignored) with sha256 recorded; deleting a document removes its files.
- PDF export ("Export PDF" in the editor): the document is converted to Typst and compiled with the local `typst` binary. Header carries the tree path, status/date/tags and the latest revision (with signature). Math goes through the `mitex` package (fetched from the Typst package registry on first use); compound structures are embedded as SVG. `GET …/export.typ` returns the source.
- Full-text search across titles, content (including mentions, quantities, reaction rows, math) and tags — sidebar search box; `#tag` lists everything with that tag
- Experiment metadata bar: status (planned / in progress / done / failed / abandoned, shown as a dot in the tree), date, tags
- Task lists (toolbar "Task list" or type `[ ] `)
- Backend-backed autosave for documents
- Last active selection restored locally on reload

## Current Implementation State

Implemented now:

- Postgres-backed document tree and document autosave
- local Docker Postgres workflow via `docker compose`
- SQL migrations, bootstrap, dump/restore, and env sync scripts
- backend entity search for `#` references
- backend user search for `@` references
- document entities mirrored from groups, projects, and experiments
- `document_mentions` indexed from saved editor content (backlinks per entity/user)
- append-only document revision history with restore (History button in the editor)
- revision signing: a revision can be signed by a user (with an optional note); signed revisions are frozen — later saves always start a new revision
- entity registry view (sidebar "Entities"): search/filter, create, edit label/type/status/attributes, aliases, backlinks
- typed attribute forms per entity type (reagent vendor/catalog/lot/expiry, sample organism/storage, instrument calibration, …) on top of the raw JSON; reagents show expired / expiring-within-30-days badges and the list can be filtered to them
- duplicate merge: references in documents are rewritten to the surviving entity (as a new revision), aliases move over, the duplicate is deleted
- entity relations (`uses`, `derived_from`, `stored_in`, `references`, `belongs_to`) authored in the registry, shown in both directions
- chemistry on `compound` entities (OpenChemLib, loaded on demand):
  - SMILES entry with validation, 2D structure rendering, formula / MW / exact mass / cLogP / TPSA / H-bond counts
  - structure editor: Ketcher (EPAM, Apache-2.0, loaded on demand with its Indigo WASM); PubChem lookup by name or CAS (fills SMILES, IUPAC name, CAS)
  - same-structure detection via canonical IDCode with one-click merge
  - compound tokens in the editor show a structure card on hover; click toggles an inline structure

Not implemented yet:

- import and draft reconciliation flow
- graph navigation beyond one hop
- authentication and collaboration

## Backend Data Model

Core persisted tables:

- `documents`
- `users`
- `entities`
- `entity_aliases`
- `document_mentions`
- `entity_relations`

Schema is defined in `db/migrations/0001_init.sql`.

Compound entities keep their chemistry in `attributes`: `smiles`, `idCode` (canonical, used for duplicate detection), `formula`, `molecularWeight`, `exactMass`, `logP`, `tpsa`, `hDonors`, `hAcceptors`, plus `casNumber`, `iupacName`, `pubchemCid` when known. Registry search matches `idCode`, `smiles`, and `casNumber` exactly.

## First-Run Seed

Bootstrapping an empty database seeds:

- `Default Group`
  - `General`
    - `Untitled Experiment`
- `Researcher` user
- a few sample entities:
  - `Sample A`
  - `Lysis Buffer`
  - `Compound X`

## Project Structure

```text
src/
  App.tsx                          # App shell, sidebar tree, create actions, toolbar
  index.css                        # Layout and editor/sidebar styles
  api/
    backend.ts                     # Frontend HTTP client
  storage/
    documentStore.ts               # Backend-backed document storage adapter
  editor/
    Editor.tsx                     # TipTap setup and editor rendering
    RevisionHistory.tsx            # History panel: list, restore, sign revisions
    AttachmentsPanel.tsx           # upload/list/delete attachments, insert images
    ExperimentMeta.tsx             # status / date / tags bar
    ReactionBlockView.tsx          # React node view for reaction blocks
  units/
    quantity.ts                    # unit table, parsing, conversion (unit-tested)
  chemistry/
    molecule.ts                    # OpenChemLib wrapper: SMILES parsing, properties, SVG
    reaction.ts                    # stoichiometry engine for reaction blocks (unit-tested)
    pubchem.ts                     # PubChem PUG REST lookup
  registry/
    EntityRegistry.tsx             # Entity list, filters, create
    EntityDetail.tsx               # Edit fields/attributes, aliases, relations, backlinks, merge
    CompoundPanel.tsx              # Structure, properties, draw, PubChem, duplicate hint
    AttributeFields.tsx            # typed attribute inputs per entity type (schema in attributeSchema.ts)
    StructureEditorDialog.tsx      # modal around the lazily loaded Ketcher editor (KetcherEditor.tsx)
    extensions/
      Mention.ts                   # async #/@// mention extensions
      CompoundToken.ts             # entity token node view with structure hover/inline
      Quantity.ts                  # inline quantity node + input rule
      Reaction.ts                  # reaction block node (React node view in ../ReactionBlockView.tsx)
      MarkdownShortcuts.ts         # markdown input rules
server/
  index.mjs                        # Express API server
  lib/
    database.mjs                   # pg pool and transactions
    migrations.mjs                 # SQL migration runner
    seed.mjs                       # bootstrap seed + document entity sync
    mentions.mjs                   # extract #/@ references from TipTap JSON into document_mentions
    revisions.mjs                  # append-only document revision snapshots
    entities.mjs                   # entity merge
    text.mjs                       # TipTap JSON -> plain text (search index, exports)
    typst.mjs                      # TipTap JSON -> Typst markup (unit-tested)
    export.mjs                     # PDF export: structures, attachments, typst compile
    attachments.mjs                # attachment storage on disk + metadata rows
db/
  migrations/
    0001_init.sql                  # Base schema
    0002_trigram_search.sql        # pg_trgm indexes for #/@ lookup
    0003_rename_protocol_to_experiment.sql
    0004_document_revisions.sql    # revision history table + backfill
    0005_relation_uniqueness.sql   # NULLS NOT DISTINCT uniqueness for relations
    0006_templates.sql             # experiment templates
    0007_document_metadata.sql     # documents.metadata (status, date, tags)
    0008_fulltext_search.sql       # search_text + generated tsvector + GIN index
    0009_revision_signatures.sql   # signed_by / signed_at / note on revisions
    0010_attachments.sql           # attachment metadata (bytes on disk)
scripts/
  db/
    migrate.mjs                    # Apply migrations
    bootstrap.mjs                  # Migrate + seed empty database
    dump.mjs                       # pg_dump wrapper
    restore.mjs                    # pg_restore wrapper
    sync.mjs                       # Copy one DB into another
```

## Dev Environment

Prerequisites:

- Docker with `docker compose`
- PostgreSQL CLI tools if you want to use `db:dump`, `db:restore`, or `db:sync`
- [Typst](https://typst.app) CLI for PDF export (`typst` on PATH)

Optional tooling:

- Node.js via `mise.toml`

If you use `mise`, install the local toolchain with:

```bash
mise install
mise trust
```

Then run project commands inside the `mise` environment:

```bash
mise exec -- npm install
```

If you do not use `mise`, install a current Node.js version manually and run the same `npm ...` commands directly.

## Run Locally

Recommended first-time setup:

With `mise`:

```bash
mise install
mise trust
mise exec -- npm install
cp .env.example .env
mise exec -- npm run db:up
export DATABASE_URL=postgres://labnotes:labnotes@localhost:5432/labnotes
mise exec -- npm run db:bootstrap
mise exec -- npm run dev:server
mise exec -- npm run dev
```

Without `mise`:

```bash
npm install
cp .env.example .env
npm run db:up
export DATABASE_URL=postgres://labnotes:labnotes@localhost:5432/labnotes
npm run db:bootstrap
npm run dev:server
npm run dev
```

If you use `.env`, make sure your shell or process launcher exports it before starting the backend. The current server reads environment variables from the process environment and does not load `.env` automatically.

Frontend dev server: `http://localhost:5173`

Backend API server: `http://localhost:5174`

If you want to keep the defaults from `.env.example`, the local Docker database uses:

- host: `localhost`
- port: `5432`
- database: `labnotes`
- user: `labnotes`
- password: `labnotes`

Build:

```bash
npm run build
npm run preview
```

## Environment

Copy `.env.example` into your preferred environment loader or export the variables manually.

Important variables:

- `DATABASE_URL`
- `DEV_DATABASE_URL`
- `PROD_DATABASE_URL`
- `PORT`
- `AUTO_MIGRATE_ON_START`
- `AUTO_SEED_ON_START`
- `REVISION_COALESCE_SECONDS`
- `TYPST_BIN` (default `typst`)
- `ATTACHMENTS_DIR` (default `data/attachments`), `MAX_ATTACHMENT_BYTES` (default 50 MB)

Example:

```bash
export POSTGRES_DB=labnotes
export POSTGRES_USER=labnotes
export POSTGRES_PASSWORD=labnotes
export POSTGRES_PORT=5432
export DATABASE_URL=postgres://labnotes:labnotes@localhost:5432/labnotes
export DEV_DATABASE_URL=postgres://labnotes:labnotes@localhost:5432/labnotes_dev
export PROD_DATABASE_URL=postgres://labnotes:labnotes@localhost:5432/labnotes_prod
```

## Local Docker Postgres

Start the local Postgres container:

```bash
mise exec -- npm run db:up
```

Inspect it:

```bash
mise exec -- npm run db:ps
mise exec -- npm run db:logs
```

Stop it:

```bash
mise exec -- npm run db:down
```

This uses a named Docker volume, so your local database state persists across container restarts.

## Database Tooling

Initialize or update the active database:

```bash
mise exec -- npm run db:migrate
mise exec -- npm run db:seed
```

Bootstrap a fresh database from scratch:

```bash
mise exec -- npm run db:bootstrap
```

For a brand-new local Docker setup, the normal sequence is:

```bash
mise exec -- npm run db:up
mise exec -- npm run db:bootstrap
```

Target a specific environment alias:

```bash
mise exec -- npm run db:migrate -- --env dev
mise exec -- npm run db:bootstrap -- --env prod
```

Inspect migration status:

```bash
mise exec -- npm run db:status
```

Dump and restore:

```bash
mise exec -- npm run db:dump -- --env dev --output /tmp/labnotes-dev.dump
mise exec -- npm run db:restore -- --env dev --input /tmp/labnotes-dev.dump
```

Sync one environment into another:

```bash
mise exec -- npm run db:sync -- --source prod --target dev
```

This uses `pg_dump` and `pg_restore`, so those PostgreSQL CLI tools need to be installed locally.

## API Surface

Current backend endpoints:

- `GET /api/health`
- `GET /api/documents/tree`
- `GET /api/search?q=&tag=` (full-text search; `websearch_to_tsquery` syntax, highlighted snippets)
- `GET /api/documents/search?q=...` (`/` lookup, with tree path)
- `GET /api/documents/:id`
- `GET /api/documents/:id/mentions` (outbound `#`/`@` references)
- `GET /api/documents/:id/export.typ`, `GET /api/documents/:id/export.pdf` (needs `typst` on PATH or `TYPST_BIN`)
- `GET /api/documents/:id/attachments`, `POST /api/documents/:id/attachments` (raw body; `X-Filename` header), `GET /api/attachments/:id` (`?download` for a download disposition), `DELETE /api/attachments/:id`
- `GET /api/documents/:id/revisions`
- `GET /api/documents/:id/revisions/:revision`
- `POST /api/documents/:id/revisions/:revision/restore`
- `POST /api/documents/:id/revisions/:revision/sign` (`{ userId, note? }`)
- `POST /api/documents`
- `PATCH /api/documents/:id` (`{ title, content }` records a revision; `{ metadata }` alone updates status/date/tags without one)
- `DELETE /api/documents/:id`
- `GET /api/templates?kind=`, `GET /api/templates/:id`, `POST /api/templates` (`{ name, documentId }` or `{ name, kind, content }`), `DELETE /api/templates/:id`
- `GET /api/entities?q=&type=&status=` (registry listing with mention counts)
- `GET /api/entities/search?q=&documentId=&type=` (`#` lookup; `documentId` boosts entities used in that project)
- `GET /api/entities/:id` (includes aliases, relations, and document backlinks)
- `POST /api/entities`
- `PATCH /api/entities/:id`
- `POST /api/entities/:id/aliases`
- `DELETE /api/entities/:id/aliases/:aliasId`
- `POST /api/entities/:id/merge` (`{ sourceId }` — folds the source into `:id`)
- `POST /api/entities/:id/relations` (`{ predicate, objectEntityId, sourceDocumentId? }`)
- `DELETE /api/entities/:id/relations/:relationId`
- `GET /api/users/search?q=...`
- `GET /api/users/:id` (includes document backlinks)

Mentions are re-indexed on every document create/update and backfilled for all documents at server start.

Every content or title change records a revision. Changes within `REVISION_COALESCE_SECONDS` (default 120) of the latest revision's start are folded into it, so a revision is a writing-session chunk rather than one row per autosave. Restoring an old revision appends a new revision; history is never rewritten.

Run the unit tests (server `.mjs` and frontend `.test.ts`, via Node's built-in runner) with:

```bash
npm test
```

These are the endpoints the current frontend uses for tree loading, autosave, and `#`/`@` lookup.

## New Deployment Init

For a brand-new deployment:

1. Provision an empty Postgres database.
2. Set `DATABASE_URL` for that deployment.
3. Run `mise exec -- npm run db:bootstrap` once.
4. Start the API server with `mise exec -- npm run server`.

## Notes and Non-Goals (Current)

- No authentication
- No collaboration
- No drag/drop tree reordering
- Math rendering uses MathJax from CDN at runtime (with `mhchem` for `\ce{...}`)
