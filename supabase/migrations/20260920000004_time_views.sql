-- Time views :: aggregate in the database, not in the page.
--
-- The first version of the time page pulled every ping and every chapter and
-- grouped them in TypeScript. That is fine at ten minutes of data and unusable
-- at a month of it -- each filter click shipped tens of thousands of rows
-- before rendering a table of twenty. These views do the grouping once, in the
-- place that is good at it.

-- Active minutes per person per hour-of-day, per day.
create or replace view usage_time_hourly with (security_invoker = true) as
select
  p.user_id,
  pr.email,
  coalesce(pr.full_name, pr.email)                    as who,
  (p.bucket at time zone 'Asia/Dubai')::date          as day,
  extract(hour from (p.bucket at time zone 'Asia/Dubai'))::int as hour,
  count(*) filter (where p.state = 'active') * 30 / 60.0 as minutes_active,
  count(*)                                    * 30 / 60.0 as minutes_open
from activity_pings p
join profiles pr on pr.id = p.user_id
group by p.user_id, pr.email, pr.full_name, 4, 5;

-- Chapters written per person per day, with cost. Reaches back to the first
-- chapter ever written, which is long before presence tracking existed.
create or replace view usage_output_daily with (security_invoker = true) as
select
  l.created_by                                        as user_id,
  coalesce(pr.full_name, pr.email, 'unattributed')    as who,
  (c.created_at at time zone 'Asia/Dubai')::date      as day,
  count(*)                                            as chapters,
  round(sum(c.cost_usd), 4)                           as cost_usd
from lab_chapters c
join lab_projects l   on l.id = c.lab_id
left join profiles pr on pr.id = l.created_by
where c.body is not null and trim(c.body) <> ''
group by l.created_by, pr.full_name, pr.email, 3;

-- Indexes the two views lean on.
create index if not exists activity_pings_user_bucket_idx
  on activity_pings(user_id, bucket);
create index if not exists lab_chapters_created_idx
  on lab_chapters(created_at) where body is not null;
