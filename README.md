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
- Rich references:
  - `#` entity references backed by the server entity registry
  - quick-create from the `#` popup: `Create "Foo" as sample / reagent / …` when nothing matches exactly
  - `@` user references backed by the server user registry
  - `/` hierarchy-first document references (rendered as `/Title`, stored as document entity mentions)
  - `#` suggestions rank entities recently used in the current project first
- Sidebar tree structure:
  - Groups -> Projects -> Experiments
- Create actions:
  - New Group
  - New Project (inside selected group)
  - New Experiment (inside selected project)
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
- entity registry view (sidebar "Entities"): search/filter, create, edit label/type/status/attributes, aliases, backlinks
- duplicate merge: references in documents are rewritten to the surviving entity (as a new revision), aliases move over, the duplicate is deleted

Not implemented yet:

- import and draft reconciliation flow
- entity relations / graph features
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
    RevisionHistory.tsx            # History panel: list and restore revisions
  registry/
    EntityRegistry.tsx             # Entity list, filters, create
    EntityDetail.tsx               # Edit fields/attributes, aliases, backlinks
    extensions/
      Mention.ts                   # async #/@ mention extensions
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
db/
  migrations/
    0001_init.sql                  # Base schema
    0002_trigram_search.sql        # pg_trgm indexes for #/@ lookup
    0003_rename_protocol_to_experiment.sql
    0004_document_revisions.sql    # revision history table + backfill
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
- `GET /api/documents/search?q=...` (`/` lookup, with tree path)
- `GET /api/documents/:id`
- `GET /api/documents/:id/mentions` (outbound `#`/`@` references)
- `GET /api/documents/:id/revisions`
- `GET /api/documents/:id/revisions/:revision`
- `POST /api/documents/:id/revisions/:revision/restore`
- `POST /api/documents`
- `PATCH /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET /api/entities?q=&type=&status=` (registry listing with mention counts)
- `GET /api/entities/search?q=&documentId=&type=` (`#` lookup; `documentId` boosts entities used in that project)
- `GET /api/entities/:id` (includes aliases and document backlinks)
- `POST /api/entities`
- `PATCH /api/entities/:id`
- `POST /api/entities/:id/aliases`
- `DELETE /api/entities/:id/aliases/:aliasId`
- `POST /api/entities/:id/merge` (`{ sourceId }` — folds the source into `:id`)
- `GET /api/users/search?q=...`
- `GET /api/users/:id` (includes document backlinks)

Mentions are re-indexed on every document create/update and backfilled for all documents at server start.

Every content or title change records a revision. Changes within `REVISION_COALESCE_SECONDS` (default 120) of the latest revision's start are folded into it, so a revision is a writing-session chunk rather than one row per autosave. Restoring an old revision appends a new revision; history is never rewritten.

Run the backend unit tests with:

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
