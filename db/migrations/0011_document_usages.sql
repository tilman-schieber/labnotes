-- Usages: an entity reference together with the amounts and role read from the surrounding
-- prose. Derived from content on every save (see server/lib/mentions.mjs), never edited directly.
create table if not exists document_usages (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  target_id text not null,
  label text,
  entity_type text,
  quantities jsonb not null default '[]'::jsonb,
  role text,
  block_index integer not null default 0,
  sentence text,
  created_at timestamptz not null default now()
);

create index if not exists document_usages_document_idx on document_usages(document_id);
create index if not exists document_usages_target_idx on document_usages(target_id);
