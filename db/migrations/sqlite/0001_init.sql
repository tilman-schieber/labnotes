-- SQLite schema, equivalent to the final state of the postgres migrations 0001-0011.
-- SQLite support starts at the current schema, so there is no incremental history here.
-- JSON lives in text columns; timestamps are ISO-8601 UTC strings (matching what pg
-- serialises timestamptz to), written by the translated now() in server SQL.

create table if not exists documents (
  id text primary key,
  kind text not null check (kind in ('group', 'project', 'experiment')),
  parent_id text references documents(id) on delete cascade,
  title text not null,
  content text not null,
  metadata text not null default '{}',
  search_text text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists documents_parent_idx on documents(parent_id);
create index if not exists documents_kind_idx on documents(kind);

create table if not exists users (
  id text primary key,
  display_name text not null,
  email text unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists entities (
  id text primary key,
  type text not null,
  subtype text,
  label text not null,
  status text not null default 'verified' check (status in ('draft', 'verified', 'archived')),
  document_id text unique references documents(id) on delete cascade,
  attributes text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists entities_type_idx on entities(type);
create index if not exists entities_status_idx on entities(status);
create index if not exists entities_label_idx on entities(label);

create table if not exists entity_aliases (
  id text primary key,
  entity_id text not null references entities(id) on delete cascade,
  alias text not null,
  kind text not null default 'synonym',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (entity_id, alias)
);

create index if not exists entity_aliases_alias_idx on entity_aliases(alias);

create table if not exists document_mentions (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  ref_type text not null check (ref_type in ('entity', 'user')),
  target_id text not null,
  label_snapshot text,
  source text not null default 'editor' check (source in ('editor', 'import', 'reconciled')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists document_mentions_document_idx on document_mentions(document_id);
create index if not exists document_mentions_target_idx on document_mentions(target_id);

create table if not exists entity_relations (
  id text primary key,
  subject_entity_id text not null references entities(id) on delete cascade,
  predicate text not null,
  object_entity_id text not null references entities(id) on delete cascade,
  confidence numeric,
  source_document_id text references documents(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists entity_relations_subject_idx on entity_relations(subject_entity_id);
create index if not exists entity_relations_object_idx on entity_relations(object_entity_id);

-- Same-relation-without-source must conflict too, so nulls are folded to ''.
create unique index if not exists entity_relations_unique_idx
  on entity_relations (subject_entity_id, predicate, object_entity_id, coalesce(source_document_id, ''));

create table if not exists document_revisions (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  revision integer not null,
  title text not null,
  content text not null,
  signed_by text references users(id) on delete set null,
  signed_at text,
  signature_note text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (document_id, revision)
);

create index if not exists document_revisions_document_idx on document_revisions(document_id, revision desc);

create table if not exists templates (
  id text primary key,
  name text not null,
  kind text not null default 'experiment' check (kind in ('group', 'project', 'experiment')),
  content text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists templates_kind_idx on templates(kind);

create table if not exists attachments (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  sha256 text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists attachments_document_idx on attachments(document_id);

create table if not exists document_usages (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  target_id text not null,
  label text,
  entity_type text,
  quantities text not null default '[]',
  role text,
  block_index integer not null default 0,
  sentence text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists document_usages_document_idx on document_usages(document_id);
create index if not exists document_usages_target_idx on document_usages(target_id);
