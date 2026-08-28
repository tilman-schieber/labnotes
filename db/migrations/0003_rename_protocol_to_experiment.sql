-- Leaf documents (the notebook entry, German "Laborprotokoll") are called experiments
-- so the English kind name is not read as "reusable procedure".
alter table documents drop constraint documents_kind_check;

update documents set kind = 'experiment' where kind = 'protocol';

alter table documents
  add constraint documents_kind_check check (kind in ('group', 'project', 'experiment'));

-- Mirrored document entities carry the kind as subtype and in attributes.
update entities
set subtype = 'experiment',
    attributes = jsonb_set(attributes, '{kind}', '"experiment"'),
    updated_at = now()
where document_id is not null and subtype = 'protocol';
