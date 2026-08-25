-- Auto pipeline :: one run walks research -> characters -> scene plan,
-- pauses for a human, then fans out one script per scene.

create type pipeline_state as enum (
  'running',
  'awaiting_approval',
  'writing',
  'done',
  'failed',
  'cancelled'
);

create table pipelines (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  brief        text not null,
  source_ids   uuid[] not null default '{}',
  state        pipeline_state not null default 'running',
  stage        text,
  error        text,
  research_id  uuid references story_docs(id) on delete set null,
  character_id uuid references story_docs(id) on delete set null,
  plan_id      uuid references story_docs(id) on delete set null,
  scenes_total int not null default 0,
  scenes_done  int not null default 0,
  cost_usd     numeric(10,4) not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index pipelines_project_idx on pipelines(project_id);
create index pipelines_state_idx   on pipelines(state);

alter table pipelines enable row level security;

create policy pipelines_read   on pipelines for select using (auth.uid() is not null);
create policy pipelines_insert on pipelines for insert with check (can_create());
create policy pipelines_update on pipelines for update using (can_create()) with check (can_create());
create policy pipelines_delete on pipelines for delete using (is_admin());

-- Scripts written by the fan-out stage point back at their pipeline so the
-- UI can group them without guessing from timestamps.
alter table story_docs add column pipeline_id uuid references pipelines(id) on delete set null;
alter table story_docs add column scene_n int;
create index story_docs_pipeline_idx on story_docs(pipeline_id);
