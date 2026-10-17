-- Results read from documents (see postgres/0015_document_results.sql).
create table if not exists document_results (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  target_id text not null,
  label text,
  entity_type text,
  measure text not null,
  value real not null,
  unit text not null default '',
  source text not null default 'prose',
  block_index integer not null default 0,
  sentence text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists document_results_document_idx on document_results(document_id);
create index if not exists document_results_target_idx on document_results(target_id);
