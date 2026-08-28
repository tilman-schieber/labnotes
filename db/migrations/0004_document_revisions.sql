-- Append-only snapshots of document title/content. Revisions are numbered per document.
create table if not exists document_revisions (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  revision integer not null,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, revision)
);

create index if not exists document_revisions_document_idx on document_revisions(document_id, revision desc);

-- Snapshot the current state of existing documents as their first revision.
insert into document_revisions (id, document_id, revision, title, content, created_at, updated_at)
select 'revision-' || id || '-1', id, 1, title, content, updated_at, updated_at
from documents
on conflict do nothing;
