-- Tamper evidence for signed revisions: each signature hashes the canonical content and
-- chains onto the previously signed revision of the same document (in signing order).
alter table document_revisions add column if not exists content_hash text;
alter table document_revisions add column if not exists previous_chain_hash text;
alter table document_revisions add column if not exists chain_hash text;

-- Read-only share links to a signed revision, keyed by an unguessable token.
create table if not exists share_links (
  token text primary key,
  document_id text not null references documents(id) on delete cascade,
  revision integer not null,
  created_at timestamptz not null default now()
);

create index if not exists share_links_document_idx on share_links(document_id, revision);
