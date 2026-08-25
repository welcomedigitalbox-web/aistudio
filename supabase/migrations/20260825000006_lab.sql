-- Story Lab :: combine several sources into one new manuscript, then hand it
-- to the Studio as if it were an uploaded novel.
--
-- Separate from series on purpose. A lab project has no cast, no episodes, no
-- render style -- it produces prose, and only prose.

create type lab_state as enum ('sources', 'premise', 'outline', 'drafting', 'ready');
create type lab_output as enum ('treatment', 'manuscript');
create type source_role as enum ('spine', 'character', 'setting', 'voice', 'free');

create table lab_projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  brief        text,
  -- What the writer wants out: a short treatment, a full manuscript, or both.
  output       lab_output not null default 'treatment',
  target_words int,
  state        lab_state not null default 'sources',
  premise      text,
  outline      jsonb,
  -- Filled on export: the sources row this became.
  exported_source_id uuid references sources(id) on delete set null,
  cost_usd     numeric(10,4) not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Sources belong to the lab project, and each carries a role.
--
-- The role is what stops "combine these three books" turning into something
-- that is none of them. One spine, and everything else contributes a layer.
-- 'free' opts out for anyone who wants the blender.
create table lab_sources (
  id          uuid primary key default gen_random_uuid(),
  lab_id      uuid not null references lab_projects(id) on delete cascade,
  source_id   uuid not null references sources(id) on delete cascade,
  role        source_role not null default 'free',
  note        text,
  created_at  timestamptz not null default now(),
  unique (lab_id, source_id)
);
create index lab_sources_lab_idx on lab_sources(lab_id);

-- One row per chapter. Written one at a time for the same reason scenes are:
-- a whole manuscript in one call does not finish, and writes worse.
create table lab_chapters (
  id         uuid primary key default gen_random_uuid(),
  lab_id     uuid not null references lab_projects(id) on delete cascade,
  n          int not null,
  title      text,
  summary    text,
  body       text,
  approved   boolean not null default false,
  cost_usd   numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  unique (lab_id, n)
);
create index lab_chapters_lab_idx on lab_chapters(lab_id);

alter table lab_projects enable row level security;
alter table lab_sources  enable row level security;
alter table lab_chapters enable row level security;

create policy lab_read   on lab_projects for select using (auth.uid() is not null);
create policy lab_write  on lab_projects for all using (can_create()) with check (can_create());

create policy lab_sources_read  on lab_sources for select using (auth.uid() is not null);
create policy lab_sources_write on lab_sources for all using (can_create()) with check (can_create());

create policy lab_chapters_read  on lab_chapters for select using (auth.uid() is not null);
create policy lab_chapters_write on lab_chapters for all using (can_create()) with check (can_create());

-- Sources can now exist without a series: a lab project owns them instead.
alter table sources alter column project_id drop not null;
alter table sources add column if not exists lab_id uuid references lab_projects(id) on delete cascade;
create index if not exists sources_lab_idx on sources(lab_id);

create or replace view lab_stage as
select
  l.id as lab_id,
  l.title,
  l.state,
  l.output,
  count(distinct ls.id)                                as sources,
  count(distinct ls.id) filter (where ls.role = 'spine') as spines,
  count(distinct c.id)                                 as chapters,
  count(distinct c.id) filter (where c.body is not null) as chapters_written,
  count(distinct c.id) filter (where c.approved)        as chapters_approved,
  coalesce(sum(c.cost_usd), 0) + l.cost_usd            as cost_usd,
  case
    when count(distinct ls.id) = 0            then 'add_sources'
    when coalesce(l.premise, '') = ''         then 'draft_premise'
    when l.outline is null                    then 'draft_outline'
    when count(distinct c.id) filter (where c.body is not null) < count(distinct c.id)
                                              then 'write_chapters'
    when l.exported_source_id is null         then 'export'
    else 'done'
  end as next_step
from lab_projects l
left join lab_sources  ls on ls.lab_id = l.id
left join lab_chapters c  on c.lab_id = l.id
group by l.id;
