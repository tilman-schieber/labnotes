-- A signed revision is a frozen, attributable snapshot: later saves never coalesce into it.
alter table document_revisions add column if not exists signed_by text references users(id) on delete set null;
alter table document_revisions add column if not exists signed_at timestamptz;
alter table document_revisions add column if not exists signature_note text;
