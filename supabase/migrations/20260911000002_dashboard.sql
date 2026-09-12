-- Dashboard housekeeping.
--
-- A studio accumulates abandoned experiments. Without somewhere to put them,
-- the board stops being a view of the work and becomes a list of everything
-- ever tried -- and then nobody reads it.

alter table series add column if not exists completed_at timestamptz;

-- Progress, as a fraction of the pipeline actually finished.
--
-- Weighted by where the work is: setup is six steps but a tenth of the effort,
-- and an episode is only done when its clips exist. A bar that hits 90% at
-- "cast approved" would be lying.
drop view if exists series_progress;

create view series_progress with (security_invoker = true) as
with setup as (
  select
    s.id,
    (case when coalesce(s.bible, '') <> '' then 1 else 0 end
     + case when s.bible_approved then 1 else 0 end
     + case when s.source_id is not null then 1 else 0 end
     + case when s.refs_approved then 1 else 0 end)::numeric / 4 as done
  from series s
),
eps as (
  select
    e.series_id,
    count(*)                                              as total,
    avg(
      (case when e.plan_approved   then 1 else 0 end
       + case when e.script_approved then 1 else 0 end
       + case when e.shots_approved  then 1 else 0 end)::numeric / 3
    )                                                     as script_done,
    avg(coalesce(p.clip_ratio, 0))                        as clip_done
  from episodes e
  left join (
    select
      episode_id,
      count(*) filter (where clip_storage_key is not null)::numeric
        / nullif(count(*), 0) as clip_ratio
    from shots
    group by episode_id
  ) p on p.episode_id = e.id
  group by e.series_id
)
select
  s.id as series_id,
  coalesce(eps.total, 0) as episodes,
  setup.done             as setup_progress,
  coalesce(eps.script_done, 0) as script_progress,
  coalesce(eps.clip_done, 0)   as clip_progress,
  -- Setup is a fifth, writing two fifths, production two fifths. Anything
  -- with no episodes yet caps at the setup fifth, which is the honest answer.
  round(
    setup.done * 0.2
    + coalesce(eps.script_done, 0) * 0.4
    + coalesce(eps.clip_done, 0) * 0.4,
    3
  ) as progress
from series s
join setup on setup.id = s.id
left join eps on eps.series_id = s.id;
