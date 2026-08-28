-- The original unique constraint treated NULL source_document_id as distinct, so the same
-- relation without a source document could be inserted repeatedly and ON CONFLICT never fired.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'entity_relations'::regclass and contype = 'u';

  if constraint_name is not null then
    execute format('alter table entity_relations drop constraint %I', constraint_name);
  end if;
end $$;

-- Keep the oldest row of each duplicate set.
delete from entity_relations r
using entity_relations o
where r.subject_entity_id = o.subject_entity_id
  and r.predicate = o.predicate
  and r.object_entity_id = o.object_entity_id
  and r.source_document_id is not distinct from o.source_document_id
  and r.ctid > o.ctid;

create unique index if not exists entity_relations_unique_idx
  on entity_relations (subject_entity_id, predicate, object_entity_id, source_document_id)
  nulls not distinct;
