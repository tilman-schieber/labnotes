# Entity Backend And Rich Reference Plan

## Status

Completed so far:

- backend storage moved from local-only persistence to a server API
- Postgres schema and migration tooling added
- Docker-based local Postgres setup added
- backend seed/bootstrap flow added
- groups, projects, and protocols now persist in the backend
- document entities are mirrored into the entity registry backend model
- `#` entity lookup and `@` user lookup are wired into the editor

Still pending from this plan:

- persisted `document_mentions` extraction/indexing from editor documents
- entity registry and detail UI
- import and draft reconciliation pipeline
- relation authoring and graph features
- `/` document hierarchy trigger

## Goal

Add a simple backend-backed entity system to the lab notebook so that:

- `#` inserts rich inline references to lab entities such as samples, reagents, compounds, instruments, and notebooks
- `@` inserts rich inline references to users
- references are explicit at write time and resolve to stable ids
- ambiguous free-text mapping is avoided during normal editing
- automatic entity extraction only happens during import or an explicit draft-reconciliation workflow

## Product Direction

Normal writing flow should use explicit rich tokens rather than post-hoc parsing.

- `#` opens entity search
- `@` opens user search
- inserted tokens store stable ids and labels
- renaming entities later does not break references
- normal documents should not rely on fuzzy entity extraction

Automatic protocol-text-to-entity mapping should be limited to:

- imported notebooks
- draft-stage reconciliation
- explicit user-triggered review flows

## Reference Triggers

Initial trigger plan:

- `#` searches broadly across entity types for now
- `@` references users
- document hierarchy items should also be referencable from the backend

Document references likely need a distinct shorthand from users. Candidate directions:

- keep `@` only for users
- use `/` for hierarchy-oriented document references
- optionally support document results in `#` as well, while `/` becomes a fast path for folder-like navigation

Recommended initial rule:

- `#` searches all referencable entities, including backend-stored document entities
- `@` is reserved for users
- `/` is a follow-up enhancement for hierarchy-first document insertion and navigation

## Architecture

Keep documents and entities as separate but linked models.

Main domains:

- documents
- users
- entities
- entity aliases
- document mentions
- entity relations

Current tree items should become referencable too:

- groups
- projects
- protocols
- future notebooks

These should be stored in the backend and exposed as `document` entities so notes can reference notes.

## Backend

Start simple.

Recommended stack:

- Postgres
- single backend service
- indexed text search for lookup
- no vector database initially
- no multi-user sync complexity yet

Avoid adding semantic infrastructure until import/extraction quality requires it.

## Data Model

### Documents

Documents remain the source for notebook content and structure.

Suggested fields:

- `id`
- `kind` (`group`, `project`, `protocol`, later more kinds if needed)
- `parent_id` or explicit hierarchy fields
- `title`
- `content`
- `created_at`
- `updated_at`

### Users

Suggested fields:

- `id`
- `display_name`
- `email` or login identifier
- `status`

### Entities

Suggested fields:

- `id`
- `type`
- `subtype` optional
- `label`
- `status` (`draft`, `verified`, `archived`)
- `attributes` JSON
- `created_at`
- `updated_at`

### Entity Aliases

Used for lookup, imports, and matching.

Suggested fields:

- `id`
- `entity_id`
- `alias`
- `kind` (`synonym`, `short_name`, `import_match`, etc.)

### Document Mentions

Represents inline rich-token references in notebook content.

Suggested fields:

- `id`
- `document_id`
- `ref_type` (`entity`, `user`)
- `target_id`
- `text_snapshot` optional
- `created_at`

### Entity Relations

Represents graph-like facts between entities.

Suggested fields:

- `id`
- `subject_entity_id`
- `predicate`
- `object_entity_id`
- `confidence` optional
- `source_document_id` optional

## Rich Token Editor Plan

Replace the current static mention implementation with typed lookup-backed tokens.

Triggers:

- `#` for entities
- `@` for users
- later `/` for hierarchy-oriented document references if needed

Suggested TipTap token attributes:

```ts
{
  refType: 'entity' | 'user',
  entityType?: 'sample' | 'reagent' | 'document' | 'compound' | 'instrument',
  id: string,
  label: string
}
```

Requirements:

- inline tokens render distinctly by type
- lookup results come from backend queries
- inserted references store ids, not just display text
- tree-view documents are selectable as `document` entities
- tokens should survive document reload and rename operations

## Ontology Plan

Start with a shallow, usable ontology.

### Initial Entity Types

- `document`
- `sample`
- `specimen`
- `reagent`
- `compound`
- `instrument`
- `container`
- `location`
- `user`

### Initial Attributes By Type

Sample / specimen:

- source
- organism
- subject_id
- timepoint
- condition
- storage

Reagent:

- vendor
- catalog_number
- lot_number
- concentration
- expiry

Compound:

- formula
- smiles
- cas_number

Instrument:

- manufacturer
- model
- serial_number

Document:

- kind
- parent_document_id

### Initial Relations

Start with a small relation vocabulary:

- `uses`
- `derived_from`
- `stored_in`
- `references`
- `belongs_to`

Ontology rules:

- stable objects become entities
- graph-like facts become relations
- descriptive prose stays in notebook text
- do not attempt a full scientific knowledge graph up front

## Entity Management UX

Add a basic entity-management workflow.

### Entity Registry

Views and actions:

- list all entities
- filter by type and status
- search by label and alias
- open detail view
- edit fields and aliases

### Entity Detail

Show:

- core metadata
- aliases
- relations
- source/provenance
- backlinks from documents

### Review Flow

Needed for imported or draft-extracted entities:

- match to existing entity
- create new entity
- merge duplicates
- ignore false positives

## Import And Draft Reconciliation

Automatic population should only happen in explicit workflows.

### Pipeline

1. ingest imported notebook text
2. split into logical chunks
3. detect candidate entity mentions
4. match against known entities, aliases, users, and document titles
5. create unresolved candidates as `draft`
6. present review UI
7. confirm matches or create canonical entities
8. write resolved rich tokens into the document

### Extraction Strategy

Start rules-first.

Rules can handle:

- exact alias matches
- known document title matches
- sample ids
- catalog numbers
- lot numbers
- concentrations
- units
- structured reagent names

Later add optional LLM assistance for:

- co-reference resolution
- implicit specimen mentions
- relation extraction from fluent prose
- unresolved free-text candidates

### Confidence Handling

Use simple confidence buckets:

- high: exact alias or explicit identifier match
- medium: contextual fuzzy match within project/group
- low: inferred new entity from prose

Only high-confidence matches should auto-link without review.

## Fit With Current Codebase

The current app already has the right insertion points.

Relevant current structure:

- static mention extension can be replaced with backend lookup
- `EntityReference.ts` is an obvious place for typed reference support
- groups, projects, and protocols already have stable ids
- tree items can be mirrored as `document` entities
- editor document JSON already persists structured content

This means the entity system can be layered onto the current architecture rather than replacing it.

## Implementation Phases

### Phase 1: Backend Foundation

- add backend service and Postgres
- define tables for documents, users, entities, aliases, mentions, and relations
- move current group/project/protocol records into backend documents
- expose tree-view items as `document` entities

### Phase 2: Rich Reference Tokens

- replace static mention list
- implement `#` entity lookup
- implement `@` user lookup
- store stable ids in TipTap document JSON
- render typed reference tokens in the editor

### Phase 3: Entity Management UI

- add entity registry
- add create/edit forms
- add alias editing
- add detail pages or side panels
- add simple duplicate merge flow
- show provenance and backlinks

### Phase 4: Import Reconciliation

- add import flow for notebook text/documents
- run candidate extraction
- present review queue
- resolve to existing entities or create draft entities
- rewrite imported content with rich tokens

### Phase 5: Relations And Graph Features

- record relations such as `uses` and `derived_from`
- show linked entities for a protocol
- support cross-notebook references and graph-style navigation

## Recommended First Slice

Build the smallest version that establishes the right architecture:

- backend with Postgres
- documents table
- users table
- entities table
- aliases table
- `#` entity lookup in editor
- `@` user lookup in editor
- document entities for groups/projects/protocols
- no automatic extraction in normal editing
- no LLM dependency yet

This gives explicit references immediately and preserves a clean path to imports later.

## Execution Checklist

### Milestone 1: Backend Foundation

- choose a simple Node backend stack with TypeScript
- add Postgres connection and migration setup
- create normalized backend tables for documents, users, entities, aliases, mentions, and relations
- seed one default user and one default workspace tree
- expose read/write document APIs
- expose entity and user lookup APIs for editor suggestions

### Milestone 2: Frontend Data Integration

- replace `localStorage`-only persistence with backend-backed fetch/save flows
- keep local editor behavior intact while swapping storage source
- preserve current group/project/protocol tree behavior
- ensure document ids remain stable across reloads

### Milestone 3: Rich References

- replace static mention data with async lookup
- support `#` entity insertion
- support `@` user insertion
- store stable reference metadata in TipTap JSON
- render entity and user tokens distinctly

### Milestone 4: Entity Management

- add entity registry view
- add entity create/edit workflow
- add alias editing
- add backlinks from documents to entities

### Milestone 5: Import Reconciliation

- add import endpoint and import UI
- run rules-first extraction
- show draft review queue
- promote or merge extracted entities

## Concrete Database Schema

Postgres tables for the first implementation.

### `documents`

```sql
create table documents (
  id text primary key,
  kind text not null check (kind in ('group', 'project', 'protocol')),
  parent_id text references documents(id) on delete cascade,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_parent_idx on documents(parent_id);
create index documents_kind_idx on documents(kind);
```

### `users`

```sql
create table users (
  id text primary key,
  display_name text not null,
  email text unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `entities`

```sql
create table entities (
  id text primary key,
  type text not null,
  subtype text,
  label text not null,
  status text not null default 'verified' check (status in ('draft', 'verified', 'archived')),
  document_id text unique references documents(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entities_type_idx on entities(type);
create index entities_status_idx on entities(status);
create index entities_label_idx on entities(label);
```

### `entity_aliases`

```sql
create table entity_aliases (
  id text primary key,
  entity_id text not null references entities(id) on delete cascade,
  alias text not null,
  kind text not null default 'synonym',
  created_at timestamptz not null default now(),
  unique (entity_id, alias)
);

create index entity_aliases_alias_idx on entity_aliases(alias);
```

### `document_mentions`

```sql
create table document_mentions (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  ref_type text not null check (ref_type in ('entity', 'user')),
  target_id text not null,
  label_snapshot text,
  source text not null default 'editor' check (source in ('editor', 'import', 'reconciled')),
  created_at timestamptz not null default now()
);

create index document_mentions_document_idx on document_mentions(document_id);
create index document_mentions_target_idx on document_mentions(target_id);
```

### `entity_relations`

```sql
create table entity_relations (
  id text primary key,
  subject_entity_id text not null references entities(id) on delete cascade,
  predicate text not null,
  object_entity_id text not null references entities(id) on delete cascade,
  confidence numeric,
  source_document_id text references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (subject_entity_id, predicate, object_entity_id, source_document_id)
);

create index entity_relations_subject_idx on entity_relations(subject_entity_id);
create index entity_relations_object_idx on entity_relations(object_entity_id);
```

## Backend API Surface

Minimal HTTP API for the first backend integration.

### Documents

- `GET /api/documents/tree`
  - returns groups, projects, and protocols as a nested tree
- `GET /api/documents/:id`
  - returns a single document with content
- `POST /api/documents`
  - creates a group, project, or protocol
- `PATCH /api/documents/:id`
  - updates title and content
- `DELETE /api/documents/:id`
  - deletes a document and its descendants according to kind

### Entities

- `GET /api/entities/search?q=...`
  - broad `#` lookup across all entity types, including document entities
- `GET /api/entities/:id`
  - returns entity detail, aliases, and backlinks
- `POST /api/entities`
  - creates a new entity
- `PATCH /api/entities/:id`
  - updates label, status, subtype, and attributes
- `POST /api/entities/:id/aliases`
  - adds alias

### Users

- `GET /api/users/search?q=...`
  - `@` lookup
- `GET /api/users/:id`
  - returns user detail

### Imports

- `POST /api/imports`
  - creates an import job or reconciliation draft
- `GET /api/imports/:id`
  - returns extracted candidates and review state
- `POST /api/imports/:id/resolve`
  - confirms matches, merges, or creates draft entities

## Frontend Integration Notes

### Backend-backed tree loading

- fetch tree on app load
- derive active selection from backend ids
- keep current collapse state local to the UI

### Autosave model

- keep editor updates local and debounced
- persist document changes through `PATCH /api/documents/:id`
- defer mention indexing to save time or document save events

### Mention serialization

Reference tokens should serialize enough information to re-render even before lookup refresh.

Suggested stored attrs:

```ts
{
  refType: 'entity' | 'user',
  id: string,
  label: string,
  entityType?: string
}
```

## Initial Implementation Order

1. add backend app and package wiring
2. add persisted JSON store first or direct Postgres integration depending setup effort
3. move current document tree into backend APIs
4. swap frontend data layer from `localStorage` to backend
5. add backend entity search seeded from documents
6. replace static mentions with `#` and `@` async lookup
7. add minimal entity registry view

## First Commit Boundary

The first checkpoint commit should include:

- finalized plan
- schema definition
- endpoint contract
- implementation order

The next commit after that should start the actual backend foundation.

## Resolved Decisions

1. `#` should search broadly across entity types for now.
2. Groups, projects, and protocols should be stored in the backend too.
3. `@` should remain user-focused; document-specific shorthand can be added separately, with `/` as the leading candidate.

## Open Questions

1. Should `#` search all entity types equally, or later prioritize context-relevant types such as samples and reagents first?
2. Should imported draft entities be visible in the main registry immediately, or stay in a separate review queue until verified?
3. When `/` is added, should it insert only document references, or also serve as a command/navigation palette?
