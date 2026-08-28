-- Files attached to documents. Bytes live on disk under ATTACHMENTS_DIR, keyed by id.
create table if not exists attachments (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create index if not exists attachments_document_idx on attachments(document_id);
