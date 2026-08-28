-- Trigram indexes so the substring lookups behind `#` and `@` suggestions use an index
-- instead of scanning. pg_trgm is a trusted extension, so the database owner can enable it.
create extension if not exists pg_trgm;

create index if not exists entities_label_trgm_idx on entities using gin (lower(label) gin_trgm_ops);
create index if not exists entity_aliases_alias_trgm_idx on entity_aliases using gin (lower(alias) gin_trgm_ops);
create index if not exists users_display_name_trgm_idx on users using gin (lower(display_name) gin_trgm_ops);
