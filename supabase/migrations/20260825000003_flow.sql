-- Unified animation flow.
--
-- One path, gated: nothing at stage N+1 opens until stage N is approved.
-- The old asset/approval tables stay in place but are no longer reachable
-- from the UI; drop them once you are sure nothing there is worth keeping.

-- Look and format live on the series, because they must not change between
-- episodes. A show that is 2D in episode 1 and 3D in episode 4 is two shows.
alter table series add column if not exists render_style text not null default '2d_anime';
alter table series add column if not exists aspect_ratio text not null default '16:9';

-- Where the series is in the pipeline. Sources and script are series-level
-- because the novel is the source for the whole show.
alter table series add column if not exists source_id uuid references sources(id) on delete set null;
alter table series add column if not exists bible_approved boolean not null default false;
alter table series add column if not exists refs_approved boolean not null default false;

-- Episode-level gates. Each one is a person clicking approve, not a state a
-- job sets on its own.
alter table episodes add column if not exists script_approved boolean not null default false;
alter table episodes add column if not exists plan_approved boolean not null default false;
alter table episodes add column if not exists shots_approved boolean not null default false;

-- Sources move to series level: the novel feeds every episode.
alter table sources add column if not exists series_id uuid references series(id) on delete cascade;
create index if not exists sources_series_idx on sources(series_id);

-- Story documents get an episode binding so the writers' room output belongs
-- to the episode it was written for.
alter table story_docs add column if not exists episode_id uuid references episodes(id) on delete cascade;
create index if not exists story_docs_episode_idx on story_docs(episode_id);

-- A single view answering "what is the next thing a person has to do".
create or replace view series_stage as
select
  s.id                as series_id,
  s.title,
  s.bible_approved,
  s.refs_approved,
  (s.source_id is not null)                              as has_source,
  count(distinct r.id) filter (where r.kind = 'character') as characters,
  count(distinct r.id) filter (
    where r.kind = 'character' and r.chosen_image_id is not null
  )                                                       as characters_ready,
  count(distinct e.id)                                    as episodes,
  case
    when s.bible = '' or s.bible is null then 'write_bible'
    when not s.bible_approved            then 'approve_bible'
    when s.source_id is null             then 'add_source'
    when count(distinct r.id) filter (where r.kind = 'character') = 0 then 'add_characters'
    when count(distinct r.id) filter (
      where r.kind = 'character' and r.chosen_image_id is not null
    ) < count(distinct r.id) filter (where r.kind = 'character') then 'generate_refs'
    when not s.refs_approved             then 'approve_refs'
    when count(distinct e.id) = 0        then 'add_episode'
    else 'ready'
  end as next_step
from series s
left join refs r     on r.series_id = s.id
left join episodes e on e.series_id = s.id
group by s.id;

create or replace view episode_stage as
select
  e.id as episode_id,
  e.series_id,
  e.n,
  e.title,
  e.script_approved,
  e.plan_approved,
  e.shots_approved,
  (e.script_id is not null) as has_script,
  (e.plan_id is not null)   as has_plan,
  count(sh.id)                                                  as shots_total,
  count(sh.id) filter (where sh.keyframe_storage_key is not null) as keyframes_done,
  count(sh.id) filter (where sh.clip_storage_key is not null)     as clips_done,
  case
    when e.script_id is null   then 'write_script'
    when not e.script_approved then 'approve_script'
    when e.plan_id is null     then 'plan_scenes'
    when not e.plan_approved   then 'approve_plan'
    when count(sh.id) = 0      then 'build_shots'
    when not e.shots_approved  then 'approve_shots'
    when count(sh.id) filter (where sh.keyframe_storage_key is not null) < count(sh.id)
      then 'generate_keyframes'
    when count(sh.id) filter (where sh.clip_storage_key is not null) < count(sh.id)
      then 'generate_clips'
    else 'done'
  end as next_step
from episodes e
left join shots sh on sh.episode_id = e.id
group by e.id;
