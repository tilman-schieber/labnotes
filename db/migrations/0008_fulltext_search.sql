-- Full-text search over document title, flattened content, and tags. search_text is
-- maintained by the server on every content write and backfilled at startup.
alter table documents add column if not exists search_text text not null default '';

alter table documents add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(search_text, '') || ' ' || coalesce(metadata ->> 'tags', ''))
  ) stored;

create index if not exists documents_search_tsv_idx on documents using gin (search_tsv);
