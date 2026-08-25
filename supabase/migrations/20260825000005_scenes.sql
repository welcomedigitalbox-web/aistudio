-- Scene plan first, then one script pass per scene.
--
-- Writing a whole episode in one call times out on a 60s function and writes
-- worse: the model loses track of which scene it is on. Per-scene passes are
-- each a few seconds, and each one gets the neighbours as context.

create table scenes (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references episodes(id) on delete cascade,
  n           int not null,
  slug        text,
  job         text,
  opens_on    text,
  closes_on   text,
  characters  text[] not null default '{}',
  conflict    text,
  est_seconds int,
  -- Filled by the per-scene writer.
  script      jsonb,
  approved    boolean not null default false,
  cost_usd    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now(),
  unique (episode_id, n)
);
create index scenes_episode_idx on scenes(episode_id);

alter table scenes enable row level security;
create policy scenes_read  on scenes for select using (auth.uid() is not null);
create policy scenes_write on scenes for all using (can_create()) with check (can_create());

-- The old episode-level script slot is no longer the unit of work.
alter table episodes add column if not exists scenes_planned boolean not null default false;

drop view if exists episode_stage;

create view episode_stage as
select
  e.id as episode_id,
  e.series_id,
  e.n,
  e.title,
  e.plan_approved,
  e.script_approved,
  e.shots_approved,
  (e.plan_id is not null)                      as has_plan,
  count(sc.id)                                 as scenes_total,
  count(sc.id) filter (where sc.script is not null) as scenes_written,
  count(sh.id)                                 as shots_total,
  count(sh.id) filter (where sh.keyframe_storage_key is not null) as keyframes_done,
  count(sh.id) filter (where sh.clip_storage_key is not null)     as clips_done,
  case
    when e.plan_id is null                            then 'plan_scenes'
    when not e.plan_approved                          then 'approve_plan'
    when count(sc.id) filter (where sc.script is not null) < count(sc.id)
                                                      then 'write_scenes'
    when not e.script_approved                        then 'approve_script'
    when count(sh.id) = 0                             then 'build_shots'
    when not e.shots_approved                         then 'approve_shots'
    when count(sh.id) filter (where sh.keyframe_storage_key is not null) < count(sh.id)
                                                      then 'generate_keyframes'
    when count(sh.id) filter (where sh.clip_storage_key is not null) < count(sh.id)
                                                      then 'generate_clips'
    else 'done'
  end as next_step
from episodes e
left join scenes sc on sc.episode_id = e.id
left join shots  sh on sh.episode_id = e.id
group by e.id;
