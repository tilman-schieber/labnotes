-- Results: a measured value for an entity, read from the prose ("OD600 of #Culture A was 1.21"),
-- from results blocks and from plates. Derived from content on every save (see
-- server/lib/mentions.mjs), never edited directly.
create table if not exists document_results (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  target_id text not null,
  label text,
  entity_type text,
  measure text not null,
  value double precision not null,
  unit text not null default '',
  source text not null default 'prose',
  block_index integer not null default 0,
  sentence text,
  created_at timestamptz not null default now()
);

create index if not exists document_results_document_idx on document_results(document_id);
create index if not exists document_results_target_idx on document_results(target_id);
