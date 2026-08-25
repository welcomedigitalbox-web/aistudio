-- Shot list :: the unit that actually gets generated.
--
-- One shot is one keyframe and one clip. Dialogue is carried as voice over a
-- shot that is not a talking mouth -- listening faces, hands, the room, the
-- thing being talked about. That is cheaper, dodges lip sync entirely, and is
-- how restrained drama is cut anyway.

alter table shots add column if not exists scene_id uuid references scenes(id) on delete cascade;
alter table shots add column if not exists framing text;
alter table shots add column if not exists on_screen text;
alter table shots add column if not exists approved_at timestamptz;
create index if not exists shots_scene_idx on shots(scene_id);

-- Voice lines are separate rows: one shot may carry several, and one line may
-- span two shots.
create table shot_lines (
  id           uuid primary key default gen_random_uuid(),
  shot_id      uuid not null references shots(id) on delete cascade,
  n            int not null,
  speaker      text not null,
  line         text not null,
  -- Whether the speaker is visible. Off-screen lines are the default here.
  on_screen    boolean not null default false,
  storage_key  text,
  seconds      numeric(6,2),
  state        text not null default 'pending',
  error        text,
  cost_usd     numeric(10,4) not null default 0,
  created_at   timestamptz not null default now(),
  unique (shot_id, n)
);
create index shot_lines_shot_idx on shot_lines(shot_id);

alter table shot_lines enable row level security;
create policy shot_lines_read  on shot_lines for select using (auth.uid() is not null);
create policy shot_lines_write on shot_lines for all using (can_create()) with check (can_create());

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
  (e.plan_id is not null)                          as has_plan,
  count(distinct sc.id)                            as scenes_total,
  count(distinct sc.id) filter (where sc.script is not null) as scenes_written,
  count(distinct sh.id)                            as shots_total,
  count(distinct sh.id) filter (where sh.approved) as shots_ok,
  count(distinct sh.id) filter (where sh.keyframe_storage_key is not null) as keyframes_done,
  count(distinct sh.id) filter (where sh.clip_storage_key is not null)     as clips_done,
  count(distinct sl.id)                            as lines_total,
  count(distinct sl.id) filter (where sl.storage_key is not null) as lines_done,
  coalesce(sum(distinct sh.cost_usd), 0)           as shot_cost,
  case
    when e.plan_id is null                            then 'plan_scenes'
    when not e.plan_approved                          then 'approve_plan'
    when count(distinct sc.id) filter (where sc.script is not null) < count(distinct sc.id)
                                                      then 'write_scenes'
    when not e.script_approved                        then 'approve_script'
    when count(distinct sh.id) = 0                    then 'build_shots'
    when not e.shots_approved                         then 'approve_shots'
    when count(distinct sl.id) filter (where sl.storage_key is not null) < count(distinct sl.id)
                                                      then 'record_voice'
    when count(distinct sh.id) filter (where sh.keyframe_storage_key is not null) < count(distinct sh.id)
                                                      then 'generate_keyframes'
    when count(distinct sh.id) filter (where sh.clip_storage_key is not null) < count(distinct sh.id)
                                                      then 'generate_clips'
    else 'done'
  end as next_step
from episodes e
left join scenes sc     on sc.episode_id = e.id
left join shots sh      on sh.episode_id = e.id
left join shot_lines sl on sl.shot_id = sh.id
group by e.id;
