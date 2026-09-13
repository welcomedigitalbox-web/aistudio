-- Voice and music.
--
-- A film is half sound. Until now the pipeline produced silent clips, which
-- is a slideshow with motion.

-- A voice belongs to a character, not to a line: the same actor reads every
-- line that character speaks, across every episode.
alter table refs add column if not exists voice_id    text;
alter table refs add column if not exists voice_label text;

alter table shot_lines add column if not exists voice_state  text not null default 'idle';
alter table shot_lines add column if not exists voice_job_id text;
alter table shot_lines add column if not exists voice_model  text;

-- Music is per episode, not per shot. One cue under a three-minute episode
-- beats a different mood every eight seconds.
create table if not exists episode_music (
  id           uuid primary key default gen_random_uuid(),
  episode_id   uuid not null references episodes(id) on delete cascade,
  prompt       text not null,
  storage_key  text,
  state        text not null default 'idle',
  job_id       text,
  error        text,
  seconds      numeric(6,2),
  cost_usd     numeric(10,4) not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists episode_music_episode_idx on episode_music(episode_id);

alter table episode_music enable row level security;
create policy episode_music_read on episode_music for select using (auth.uid() is not null);
create policy episode_music_write on episode_music for all
  using (can_create()) with check (can_create());

-- The stage view gains a voice step, placed before keyframes.
--
-- Audio comes first because a spoken line has a length and a clip has to fit
-- it. Generating a five-second clip and then discovering the line runs seven
-- means paying for the clip twice.
drop view if exists episode_stage;

create view episode_stage with (security_invoker = true) as
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
  count(distinct sl.id)                            as lines_total,
  count(distinct sl.id) filter (where sl.storage_key is not null) as lines_done,
  count(distinct sh.id) filter (where sh.keyframe_storage_key is not null) as keyframes_done,
  count(distinct sh.id) filter (where sh.keyframe_approved)                as keyframes_ok,
  count(distinct sh.id) filter (where sh.clip_storage_key is not null)     as clips_done,
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
    when count(distinct sh.id) filter (where sh.keyframe_approved) < count(distinct sh.id)
                                                      then 'approve_keyframes'
    when count(distinct sh.id) filter (where sh.clip_storage_key is not null) < count(distinct sh.id)
                                                      then 'generate_clips'
    else 'done'
  end as next_step
from episodes e
left join scenes sc on sc.episode_id = e.id
left join shots sh  on sh.episode_id = e.id
left join shot_lines sl on sl.shot_id = sh.id
group by e.id;
