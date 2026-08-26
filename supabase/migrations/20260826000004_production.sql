-- Production :: keyframe, then clip.
--
-- Two stages because they cost an order of magnitude apart. A keyframe is a
-- few cents and a clip is thirty; catching a bad composition at the still
-- saves the clip you would otherwise have paid for and thrown away.

alter table shots add column if not exists keyframe_state    text not null default 'idle';
alter table shots add column if not exists keyframe_job_id   text;
alter table shots add column if not exists keyframe_model    text;
alter table shots add column if not exists keyframe_error    text;
alter table shots add column if not exists keyframe_approved boolean not null default false;

alter table shots add column if not exists clip_state  text not null default 'idle';
alter table shots add column if not exists clip_job_id text;
alter table shots add column if not exists clip_model  text;
alter table shots add column if not exists clip_error  text;
alter table shots add column if not exists clip_seconds numeric(6,2);

-- Continuity within a scene: a clip can start from the last frame of the one
-- before it instead of its own keyframe. Across a scene boundary that is
-- wrong -- the cut is meant to jump -- so this is only ever set inside one.
alter table shots add column if not exists chain_from_shot_id uuid references shots(id) on delete set null;
alter table shots add column if not exists last_frame_storage_key text;

create index if not exists shots_keyframe_job_idx on shots(keyframe_job_id);
create index if not exists shots_clip_job_idx     on shots(clip_job_id);

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
group by e.id;
