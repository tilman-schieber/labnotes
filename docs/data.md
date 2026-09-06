# Data, backends & API

## Backends

The server runs on **Postgres** or **SQLite**; `DATABASE_URL` decides:

| `DATABASE_URL` | Backend |
| --- | --- |
| `postgres://user:pass@host:5432/db` | Postgres (via `pg`) |
| `sqlite:data/labnotes.db`, a bare `*.db` / `*.sqlite` path, `:memory:` | SQLite (Node's built-in `node:sqlite`; no server, no extra dependency) |

SQLite is the zero-setup option and is enough for a single user. Postgres brings full-text ranking and trigram similarity for `#` suggestions; SQLite falls back to substring matching and match-position ranking, which is exact-match compatible but ranked more simply. SQLite's `lower()` only folds ASCII, so non-ASCII names match case-sensitively there.

A SQLite notebook is one file plus the attachments directory — copying both is a complete backup. For Postgres use `npm run db:dump` / `db:restore`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://localhost:5432/labnotes` | see above |
| `PORT` | `5174` | API port |
| `AUTO_MIGRATE_ON_START` | `true` | apply pending migrations on start |
| `AUTO_SEED_ON_START` | `true` | seed an empty database; also re-syncs derived data |
| `REVISION_COALESCE_SECONDS` | `120` | writing-session window for revisions |
| `TYPST_BIN` | `typst` | Typst binary for PDF export |
| `ATTACHMENTS_DIR` | `data/attachments` | where attachment bytes live |
| `MAX_ATTACHMENT_BYTES` | 50 MB | upload limit |

`DEV_DATABASE_URL` / `PROD_DATABASE_URL` are used by the `db:*` scripts with `--env dev|prod`.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` / `dev:server` | Vite frontend / API with reload |
| `npm run db:up` / `db:down` | local Postgres via Docker Compose |
| `npm run db:migrate`, `db:status` | apply / list migrations for the configured backend |
| `npm run db:seed`, `db:bootstrap` | seed; migrate + seed |
| `npm run db:dump`, `db:restore`, `db:sync` | pg_dump-based; refuse SQLite URLs |
| `npm test` | unit tests (server and shared modules) |

Migrations are SQL files per backend under `db/migrations/postgres/` (incremental history) and `db/migrations/sqlite/`; versions are the filenames.

## Data model

| Table | Holds |
| --- | --- |
| `documents` | the tree: kind, parent, title, content (TipTap JSON), metadata, search text |
| `document_revisions` | snapshots per document with signature and chain hashes |
| `share_links` | token → document + revision |
| `entities`, `entity_aliases`, `entity_relations` | the registry |
| `document_mentions` | which document references which entity/user (derived) |
| `document_usages` | entity × amounts × role per sentence (derived) |
| `attachments` | file metadata; bytes on disk under `ATTACHMENTS_DIR` |
| `templates` | reusable content |
| `users` | people for `@` and signing |

Everything marked *derived* is rebuilt from content on every save and at startup; it is safe to drop and regenerate.

## Users

There is no login. Users exist for `@` references and signatures; the seed creates one ("Researcher"). Add more with SQL for now, e.g. `insert into users (id, display_name, email) values ('user-anna', 'Anna', 'anna@example.org')`.

## HTTP API

All routes are JSON under `/api`. Ids are opaque strings.

**Documents**

| Method & path | Purpose |
| --- | --- |
| `GET /documents/tree` | the whole tree with content and metadata |
| `GET /documents/:id` | one document with group/project ids |
| `POST /documents` | `{ kind, parentId, title, content? }` |
| `PATCH /documents/:id` | `{ title, content }` saves and records a revision; `{ metadata }` alone updates status/date/tags without a revision |
| `DELETE /documents/:id` | cascades to children, revisions, mentions, usages, attachments |
| `GET /documents/search?q=` | titles for `#` document lookup |
| `GET /search?q=&tag=` | full-text search with snippets |
| `GET /documents/:id/mentions`, `/usages` | derived references and usages |
| `GET /documents/:id/export.typ`, `/export.pdf` | export (book for projects/groups) |

**Revisions and sharing**

| Method & path | Purpose |
| --- | --- |
| `GET /documents/:id/revisions` | list, newest first, with hashes |
| `GET /documents/:id/revisions/:n` | one revision with content |
| `POST …/revisions/:n/sign` | `{ userId, note? }` |
| `POST …/revisions/:n/restore` | restore as a new revision |
| `GET /documents/:id/revisions/verify` | recompute the chain |
| `POST …/revisions/:n/share` | create or return the share link |
| `GET /documents/:id/shares`, `DELETE /share/:token` | list / revoke |
| `GET /share/:token`, `.pdf`, `.typ` | public read-only views (not under `/api`) |

**Attachments and templates**

| Method & path | Purpose |
| --- | --- |
| `GET /documents/:id/attachments` | list |
| `POST /documents/:id/attachments` | raw body; name in `X-Filename` (URL-encoded) or `?filename=` |
| `GET /attachments/:id[?download]`, `DELETE /attachments/:id` | fetch / remove |
| `GET /templates?kind=`, `GET /templates/:id`, `POST /templates`, `DELETE /templates/:id` | `POST` takes `{ name, documentId }` or `{ name, kind, content }` |

**Entities**

| Method & path | Purpose |
| --- | --- |
| `GET /entities?q=&type=&status=` | registry listing with mention counts |
| `GET /entities/search?q=&type=&documentId=` | ranked suggestions for `#` |
| `GET /entities/labels` | labels and aliases for recognition |
| `GET /entities/:id` | entity, aliases, backlinks, relations, usages, totals |
| `GET /entities/:id/graph` | co-used entities and `derived_from` lineage |
| `POST /entities`, `PATCH /entities/:id`, `DELETE /entities/:id` | create / update / delete (delete refuses referenced or document entities) |
| `POST /entities/:id/aliases`, `DELETE /entities/:id/aliases/:aliasId` | aliases |
| `POST /entities/:id/relations`, `DELETE /entities/:id/relations/:relationId` | relations |
| `POST /entities/:id/merge` | `{ sourceId }` folds the source into `:id` |
| `GET /users/search?q=`, `GET /users/:id` | people |

Example — create a reagent and reference it from a new experiment:

```bash
curl -s -X POST localhost:5174/api/entities -H 'content-type: application/json' \
  -d '{"type":"reagent","label":"Lysis Buffer","attributes":{"amount":"500 mL","expiry":"2027-01-31"}}'

curl -s -X POST localhost:5174/api/documents -H 'content-type: application/json' \
  -d '{"kind":"experiment","parentId":"<project id>","title":"Lysis test"}'
```

The content format is TipTap/ProseMirror JSON; the node types that matter are `entityMention` (`attrs.id`, `label`, `entityType`), `userMention`, `quantity` (`value`, `unit`), `timestamp` (`at`), `reaction` (`title`, `components`), `inlineMath` / `blockMath` (`latex`), and `image` (`src` pointing at `/api/attachments/<id>`).
