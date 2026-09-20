-- Ownership :: a creator sees their own work, and nothing else.
--
-- Until now every signed-in person read every row. That was fine when the
-- studio was one person. It stops being fine the moment two creators share an
-- account list, and it is the wrong default to grow out of rather than into.
--
-- Three ways to reach a lab or a show:
--   1. you own it          (created_by / owner)
--   2. it was shared with you   (lab_access / show_access)
--   3. you are an admin    (sees everything, by definition)
--
-- Reviewers are deliberately NOT global. A reviewer sees what was shared with
-- them, which is what makes "what is on my desk" a real question with a real
-- answer instead of a list of everything in the building.

-- ---------------------------------------------------------------- access ---

create table if not exists lab_access (
  lab_id     uuid not null references lab_projects(id) on delete cascade,
  user_id    uuid not null references profiles(id)     on delete cascade,
  -- viewer reads; editor writes; reviewer reads and signs off.
  access     text not null default 'viewer'
             check (access in ('viewer', 'editor', 'reviewer')),
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (lab_id, user_id)
);
create index if not exists lab_access_user_idx on lab_access(user_id);

-- show_access predates this migration and has no access column; give it the
-- same vocabulary so one mental model covers both halves of the app.
alter table show_access
  add column if not exists access text not null default 'viewer';

do $$ begin
  alter table show_access add constraint show_access_access_check
    check (access in ('viewer', 'editor', 'reviewer'));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- predicates ---

create or replace function can_see_lab(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from lab_projects l
                  where l.id = p_lab and l.created_by = auth.uid())
      or exists (select 1 from lab_access a
                  where a.lab_id = p_lab and a.user_id = auth.uid())
$$;

create or replace function can_edit_lab(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from lab_projects l
                  where l.id = p_lab and l.created_by = auth.uid())
      or exists (select 1 from lab_access a
                  where a.lab_id = p_lab and a.user_id = auth.uid()
                    and a.access = 'editor')
$$;

create or replace function can_review_lab(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from lab_access a
                  where a.lab_id = p_lab and a.user_id = auth.uid()
                    and a.access = 'reviewer')
$$;

create or replace function can_see_series(p_series uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from series s
                  where s.id = p_series and s.created_by = auth.uid())
      or exists (select 1 from show_access a
                  where a.series_id = p_series and a.user_id = auth.uid())
$$;

-- ------------------------------------------------------------------- labs ---

drop policy if exists lab_read          on lab_projects;
drop policy if exists lab_write         on lab_projects;
drop policy if exists lab_sources_read  on lab_sources;
drop policy if exists lab_sources_write on lab_sources;
drop policy if exists lab_chapters_read on lab_chapters;
drop policy if exists lab_chapters_write on lab_chapters;

alter table lab_access enable row level security;

create policy lab_access_read on lab_access for select
  using (user_id = auth.uid() or can_see_lab(lab_id));

-- Sharing is the owner's call, not the recipient's.
create policy lab_access_write on lab_access for all
  using (is_admin() or exists (select 1 from lab_projects l
                                where l.id = lab_id and l.created_by = auth.uid()))
  with check (is_admin() or exists (select 1 from lab_projects l
                                     where l.id = lab_id and l.created_by = auth.uid()));

create policy lab_select on lab_projects for select using (can_see_lab(id));

-- Anyone who may create gets to create; after that the row is theirs.
create policy lab_insert on lab_projects for insert
  with check (can_create() and created_by = auth.uid());

create policy lab_update on lab_projects for update
  using (can_edit_lab(id)) with check (can_edit_lab(id));

create policy lab_delete on lab_projects for delete
  using (is_admin() or created_by = auth.uid());

create policy lab_sources_select on lab_sources for select using (can_see_lab(lab_id));
create policy lab_sources_write  on lab_sources for all
  using (can_edit_lab(lab_id)) with check (can_edit_lab(lab_id));

create policy lab_chapters_select on lab_chapters for select using (can_see_lab(lab_id));
create policy lab_chapters_write  on lab_chapters for all
  using (can_edit_lab(lab_id)) with check (can_edit_lab(lab_id));

-- ------------------------------------------------------------------ shows ---

drop policy if exists series_read  on series;
drop policy if exists series_write on series;

create policy series_select on series for select using (can_see_series(id));
create policy series_insert on series for insert
  with check (can_create() and created_by = auth.uid());
create policy series_update on series for update
  using (can_see_series(id)) with check (can_see_series(id));
create policy series_delete on series for delete
  using (is_admin() or created_by = auth.uid());

-- ------------------------------------------------------------------ views ---

-- A view runs as its owner unless told otherwise, which would hand every
-- creator the whole table through the back door. security_invoker makes the
-- policies above apply to reads through the view.
alter view lab_stage set (security_invoker = true);

-- Orphaned rows would otherwise be invisible to everyone including their
-- author. Anything with no owner goes to the first admin.
update lab_projects
   set created_by = (select id from profiles where role = 'admin' order by created_at limit 1)
 where created_by is null;

update series
   set created_by = (select id from profiles where role = 'admin' order by created_at limit 1)
 where created_by is null;
