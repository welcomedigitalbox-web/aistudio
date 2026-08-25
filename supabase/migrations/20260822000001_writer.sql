-- Writer AI :: source library + agent documents
-- Sources are reference material the team uploads. Every source records why
-- the team may adapt it -- that field is not decoration.

create type rights_basis as enum ('own','licensed','public_domain');
create type agent_kind   as enum ('research','character','scene_plan','script');
create type source_state as enum ('uploaded','extracting','ready','failed');

create table sources (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  title        text not null,
  author       text,
  basis        rights_basis not null,
  basis_note   text,
  storage_key  text not null,
  state        source_state not null default 'uploaded',
  error        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index sources_project_idx on sources(project_id);

-- Two layers: body is raw chapter text, summary is the distilled version
-- agents read by default. Sending whole books to every agent is the fastest
-- way to burn the API budget.
create table source_chunks (
  id         uuid primary key default gen_random_uuid(),
  source_id  uuid not null references sources(id) on delete cascade,
  n          int not null,
  label      text,
  body       text not null,
  summary    text,
  chars      int not null default 0,
  created_at timestamptz not null default now(),
  unique (source_id, n)
);
create index source_chunks_source_idx on source_chunks(source_id);

-- Agent output. parent_id traces which document fed which.
create table story_docs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  agent       agent_kind not null,
  title       text not null,
  body        jsonb not null default '{}'::jsonb,
  notes       text,
  parent_id   uuid references story_docs(id) on delete set null,
  source_ids  uuid[] not null default '{}',
  model       text,
  cost_usd    numeric(10,4) not null default 0,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index story_docs_project_idx on story_docs(project_id);
create index story_docs_agent_idx   on story_docs(agent);

alter table sources       enable row level security;
alter table source_chunks enable row level security;
alter table story_docs    enable row level security;

create policy sources_read   on sources for select using (auth.uid() is not null);
create policy sources_insert on sources for insert with check (can_create());
create policy sources_update on sources for update using (can_create()) with check (can_create());
create policy sources_delete on sources for delete using (is_admin());

create policy chunks_read on source_chunks for select using (auth.uid() is not null);

create policy docs_read   on story_docs for select using (auth.uid() is not null);
create policy docs_insert on story_docs for insert with check (can_create());
create policy docs_update on story_docs for update using (can_create()) with check (can_create());
create policy docs_delete on story_docs for delete using (is_admin());
