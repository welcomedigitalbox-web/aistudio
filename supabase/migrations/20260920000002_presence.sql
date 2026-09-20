-- Presence :: how long each person actually spent in the app.
--
-- There is no honest way to derive this from the cost tables. A chapter that
-- cost $0.04 says nothing about whether it took four minutes or forty, and a
-- person reading someone else's draft generates no rows at all.
--
-- So the client says so, every 30 seconds, only while the tab is visible and
-- only while the person has touched something recently. Time is then counted
-- in buckets rather than summed from durations: a bucket exists or it does
-- not, so a double-fired ping, a refresh, or two tabs open side by side all
-- collapse to the same minute instead of inflating it.

create table activity_pings (
  user_id  uuid not null references profiles(id) on delete cascade,
  -- The 30-second slot this ping falls in. Primary key, so it is idempotent.
  bucket   timestamptz not null,
  lab_id   uuid references lab_projects(id) on delete set null,
  series_id uuid references series(id)      on delete set null,
  -- 'active' = input in the last 60s. 'idle' = tab open, nobody home.
  state    text not null default 'active' check (state in ('active', 'idle')),
  primary key (user_id, bucket)
);
create index activity_pings_bucket_idx on activity_pings(bucket);
create index activity_pings_lab_idx    on activity_pings(lab_id) where lab_id is not null;

alter table activity_pings enable row level security;

-- You write your own presence and nobody else's.
create policy pings_insert on activity_pings for insert
  with check (user_id = auth.uid());
create policy pings_update on activity_pings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pings_read on activity_pings for select
  using (user_id = auth.uid() or is_admin());

-- Round to the 30-second slot. Called by the API, not the client, so the
-- client cannot backdate itself into a longer day.
create or replace function record_ping(
  p_lab uuid default null,
  p_series uuid default null,
  p_state text default 'active'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  slot timestamptz := to_timestamp(floor(extract(epoch from now()) / 30) * 30);
begin
  insert into activity_pings (user_id, bucket, lab_id, series_id, state)
  values (auth.uid(), slot, p_lab, p_series, coalesce(p_state, 'active'))
  on conflict (user_id, bucket) do update
    -- An active ping always beats an idle one for the same slot.
    set state     = case when activity_pings.state = 'active' then 'active'
                         else excluded.state end,
        lab_id    = coalesce(excluded.lab_id, activity_pings.lab_id),
        series_id = coalesce(excluded.series_id, activity_pings.series_id);
end $$;

-- ------------------------------------------------------------------ views ---

-- One row per person per day. Buckets × 30s, so the numbers are exact to
-- within one bucket rather than inferred from gaps.
create view usage_time_daily with (security_invoker = true) as
select
  p.user_id,
  pr.email,
  pr.full_name,
  (p.bucket at time zone 'Asia/Dubai')::date        as day,
  count(*)                                    * 30 / 60.0 as minutes_open,
  count(*) filter (where p.state = 'active')  * 30 / 60.0 as minutes_active,
  min(p.bucket)                                            as first_seen,
  max(p.bucket)                                            as last_seen
from activity_pings p
join profiles pr on pr.id = p.user_id
group by p.user_id, pr.email, pr.full_name, 3;

-- Same, split by what they had open. Answers "where did the week go".
create view usage_time_by_lab with (security_invoker = true) as
select
  p.user_id,
  pr.email,
  p.lab_id,
  l.title                                     as lab_title,
  (p.bucket at time zone 'Asia/Dubai')::date  as day,
  count(*) filter (where p.state = 'active') * 30 / 60.0 as minutes_active
from activity_pings p
join profiles pr    on pr.id = p.user_id
join lab_projects l on l.id = p.lab_id
group by p.user_id, pr.email, p.lab_id, l.title, 5;
