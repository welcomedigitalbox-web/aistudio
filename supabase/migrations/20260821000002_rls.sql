-- AI Studio :: RLS
-- Internal tool: every signed-in team member reads everything.
-- Writes are gated by role. Role escalation is blocked at the DB level.

alter table profiles         enable row level security;
alter table clients          enable row level security;
alter table projects         enable row level security;
alter table assets           enable row level security;
alter table asset_versions   enable row level security;
alter table comments         enable row level security;
alter table approvals        enable row level security;
alter table generation_jobs  enable row level security;

create or replace function current_role_name() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function can_create() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','creator') from public.profiles where id = auth.uid()), false)
$$;

-- ----- profiles -----
create policy profiles_read on profiles
  for select using (auth.uid() is not null);

-- A user may edit their own name, never their own role.
create policy profiles_self_update on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles p where p.id = auth.uid()));

create policy profiles_admin_update on profiles
  for update using (is_admin()) with check (is_admin());

-- ----- clients / projects -----
create policy clients_read on clients for select using (auth.uid() is not null);
create policy clients_write on clients for all using (is_admin()) with check (is_admin());

create policy projects_read on projects for select using (auth.uid() is not null);
create policy projects_write on projects for all using (is_admin()) with check (is_admin());

-- ----- assets -----
create policy assets_read on assets for select using (auth.uid() is not null);
create policy assets_insert on assets for insert with check (can_create());
create policy assets_update on assets for update using (can_create()) with check (can_create());
create policy assets_delete on assets for delete using (is_admin());

-- ----- versions: insert-only for creators, no deletes except admin -----
create policy versions_read on asset_versions for select using (auth.uid() is not null);
create policy versions_insert on asset_versions for insert with check (can_create());
create policy versions_delete on asset_versions for delete using (is_admin());

-- ----- comments: anyone signed in can comment, only author edits -----
create policy comments_read on comments for select using (auth.uid() is not null);
create policy comments_insert on comments for insert with check (author_id = auth.uid());
create policy comments_update on comments for update using (author_id = auth.uid() or is_admin());
create policy comments_delete on comments for delete using (author_id = auth.uid() or is_admin());

-- ----- approvals: reviewers and admins only, append-only -----
create policy approvals_read on approvals for select using (auth.uid() is not null);
create policy approvals_insert on approvals for insert
  with check (approver_id = auth.uid() and current_role_name() in ('admin','reviewer'));

-- ----- jobs: read all, writes come from the service role only -----
create policy jobs_read on generation_jobs for select using (auth.uid() is not null);
