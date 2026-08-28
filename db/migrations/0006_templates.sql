create table if not exists templates (
  id text primary key,
  name text not null,
  kind text not null default 'experiment' check (kind in ('group', 'project', 'experiment')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_kind_idx on templates(kind);
