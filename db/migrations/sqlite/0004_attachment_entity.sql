-- An attachment may belong to an entity as well as to its document: a spectrum uploaded in the
-- experiment where it was measured, linked to the batch it describes.
alter table attachments add column entity_id text references entities(id) on delete set null;
create index if not exists attachments_entity_idx on attachments(entity_id);
