-- Initials identify a person in experiment and batch codes (TS-012-A). Filled from the display
-- name when absent; editable per user.
alter table users add column initials text;
