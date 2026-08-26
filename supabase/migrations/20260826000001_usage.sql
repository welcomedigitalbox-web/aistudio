-- Usage :: every paid call in one place.
--
-- Cost lives on seven tables because each stage owns its own rows. Rather than
-- move it, this view unions them into a single event stream with a provider,
-- a stage and a day -- which is what anyone actually wants to look at.

create or replace view usage_events as

select
  d.created_at,
  d.cost_usd,
  case when coalesce(d.model, '') like 'claude%' then 'anthropic' else 'other' end as provider,
  coalesce(d.model, 'claude-sonnet-4-6') as model,
  d.agent::text                          as stage,
  d.title                                as item,
  s.id                                   as series_id,
  s.title                                as series_title,
  null::uuid                             as lab_id,
  null::text                             as lab_title
from story_docs d
left join episodes e on e.id = d.episode_id
left join series s   on s.id = e.series_id
where d.cost_usd > 0

union all

select
  sc.created_at,
  sc.cost_usd,
  'anthropic',
  'claude-sonnet-4-6',
  'scene script',
  coalesce(sc.slug, 'Scene ' || sc.n),
  s.id,
  s.title,
  null::uuid,
  null::text
from scenes sc
join episodes e on e.id = sc.episode_id
join series s   on s.id = e.series_id
where sc.cost_usd > 0

union all

select
  ri.created_at,
  ri.cost_usd,
  case when coalesce(ri.model, '') like 'fal-ai%' then 'fal' else 'other' end,
  coalesce(ri.model, 'unknown'),
  'reference art',
  r.name || ' — ' || coalesce(ri.angle, ''),
  s.id,
  s.title,
  null::uuid,
  null::text
from ref_images ri
join refs r   on r.id = ri.ref_id
join series s on s.id = r.series_id
where ri.cost_usd > 0

union all

select
  sh.created_at,
  sh.cost_usd,
  'fal',
  'unknown',
  'shot',
  'Shot ' || sh.n,
  s.id,
  s.title,
  null::uuid,
  null::text
from shots sh
join episodes e on e.id = sh.episode_id
join series s   on s.id = e.series_id
where sh.cost_usd > 0

union all

select
  sl.created_at,
  sl.cost_usd,
  'elevenlabs',
  'unknown',
  'voice',
  sl.speaker,
  s.id,
  s.title,
  null::uuid,
  null::text
from shot_lines sl
join shots sh   on sh.id = sl.shot_id
join episodes e on e.id = sh.episode_id
join series s   on s.id = e.series_id
where sl.cost_usd > 0

union all

select
  l.updated_at,
  l.cost_usd,
  'anthropic',
  'claude-sonnet-4-6',
  'lab planning',
  l.title,
  null::uuid,
  null::text,
  l.id,
  l.title
from lab_projects l
where l.cost_usd > 0

union all

select
  c.created_at,
  c.cost_usd,
  'anthropic',
  'claude-sonnet-4-6',
  'lab chapter',
  coalesce(c.title, 'Chapter ' || c.n),
  null::uuid,
  null::text,
  l.id,
  l.title
from lab_chapters c
join lab_projects l on l.id = c.lab_id
where c.cost_usd > 0;

create or replace view usage_daily as
select
  date_trunc('day', created_at)::date as day,
  provider,
  sum(cost_usd)                       as cost_usd,
  count(*)                            as calls
from usage_events
group by 1, 2;
