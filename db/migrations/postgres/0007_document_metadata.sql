-- Structured per-document fields kept outside the editor content: status, date, tags.
alter table documents add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists documents_metadata_tags_idx on documents using gin ((metadata -> 'tags'));
