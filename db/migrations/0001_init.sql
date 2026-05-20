create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key,
  kind text not null check (kind in ('group', 'project', 'protocol')),
  parent_id text references documents(id) on delete cascade,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_parent_idx on documents(parent_id);
create index if not exists documents_kind_idx on documents(kind);

create table if not exists users (
  id text primary key,
  display_name text not null,
  email text unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists entities (
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

create index if not exists entities_type_idx on entities(type);
create index if not exists entities_status_idx on entities(status);
create index if not exists entities_label_idx on entities(label);

create table if not exists entity_aliases (
  id text primary key,
  entity_id text not null references entities(id) on delete cascade,
  alias text not null,
  kind text not null default 'synonym',
  created_at timestamptz not null default now(),
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
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  unique (subject_entity_id, predicate, object_entity_id, source_document_id)
);

create index if not exists entity_relations_subject_idx on entity_relations(subject_entity_id);
create index if not exists entity_relations_object_idx on entity_relations(object_entity_id);
