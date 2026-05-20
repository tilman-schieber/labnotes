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
  - `@` user references backed by the server user registry
- Sidebar tree structure:
  - Groups -> Projects -> Protocols
- Create actions:
  - New Group
  - New Project (inside selected group)
  - New Protocol (inside selected project)
- Backend-backed autosave for documents
- Last active selection restored locally on reload

## Current Implementation State

Implemented now:

- Postgres-backed document tree and document autosave
- local Docker Postgres workflow via `docker compose`
- SQL migrations, bootstrap, dump/restore, and env sync scripts
- backend entity search for `#` references
- backend user search for `@` references
- document entities mirrored from groups, projects, and protocols

Not implemented yet:

- persisted `document_mentions` indexing from editor content
- entity registry UI
- import and draft reconciliation flow
- `/` hierarchy reference trigger
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
    - `Untitled Protocol`
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
    ReactionBlock.ts               # placeholder
    SpreadsheetBlock.ts            # placeholder
    EntityReference.ts             # placeholder
    extensions/
      Mention.ts                   # async #/@ mention extensions
      MarkdownShortcuts.ts         # markdown input rules
server/
  index.mjs                        # Express API server
  lib/
    database.mjs                   # pg pool and transactions
    migrations.mjs                 # SQL migration runner
    seed.mjs                       # bootstrap seed + document entity sync
db/
  migrations/
    0001_init.sql                  # Base schema
scripts/
  db/
    migrate.mjs                    # Apply migrations
    bootstrap.mjs                  # Migrate + seed empty database
    dump.mjs                       # pg_dump wrapper
    restore.mjs                    # pg_restore wrapper
    sync.mjs                       # Copy one DB into another
```

## Run Locally

```bash
npm install
npm run db:up
export DATABASE_URL=postgres://labnotes:labnotes@localhost:5432/labnotes
npm run db:bootstrap
npm run dev:server
npm run dev
```

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
npm run db:up
```

Inspect it:

```bash
npm run db:ps
npm run db:logs
```

Stop it:

```bash
npm run db:down
```

This uses a named Docker volume, so your local database state persists across container restarts.

## Database Tooling

Initialize or update the active database:

```bash
npm run db:migrate
npm run db:seed
```

Bootstrap a fresh database from scratch:

```bash
npm run db:bootstrap
```

For a brand-new local Docker setup, the normal sequence is:

```bash
npm run db:up
npm run db:bootstrap
```

Target a specific environment alias:

```bash
npm run db:migrate -- --env dev
npm run db:bootstrap -- --env prod
```

Inspect migration status:

```bash
npm run db:status
```

Dump and restore:

```bash
npm run db:dump -- --env dev --output /tmp/labnotes-dev.dump
npm run db:restore -- --env dev --input /tmp/labnotes-dev.dump
```

Sync one environment into another:

```bash
npm run db:sync -- --source prod --target dev
```

This uses `pg_dump` and `pg_restore`, so those PostgreSQL CLI tools need to be installed locally.

## API Surface

Current backend endpoints:

- `GET /api/health`
- `GET /api/documents/tree`
- `GET /api/documents/:id`
- `POST /api/documents`
- `PATCH /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET /api/entities/search?q=...`
- `GET /api/entities/:id`
- `POST /api/entities`
- `PATCH /api/entities/:id`
- `POST /api/entities/:id/aliases`
- `GET /api/users/search?q=...`
- `GET /api/users/:id`

These are the endpoints the current frontend uses for tree loading, autosave, and `#`/`@` lookup.

## New Deployment Init

For a brand-new deployment:

1. Provision an empty Postgres database.
2. Set `DATABASE_URL` for that deployment.
3. Run `npm run db:bootstrap` once.
4. Start the API server with `npm run server`.

## Notes and Non-Goals (Current)

- No authentication
- No collaboration
- No drag/drop tree reordering
- `document_mentions` rows are not yet derived from saved TipTap content
- Math rendering uses MathJax from CDN at runtime (with `mhchem` for `\ce{...}`)
