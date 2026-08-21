-- AI Studio :: base schema
-- Versions are append-only. Every version carries its own cost.

create extension if not exists "pgcrypto";

create type app_role     as enum ('admin','creator','reviewer');
create type asset_kind   as enum ('script','image','video','audio','composite');
create type asset_status as enum ('draft','internal_review','approved','rejected','published');
create type job_state    as enum ('queued','running','succeeded','failed','cancelled');
create type decision     as enum ('approved','changes_requested','rejected');

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       app_role not null default 'creator',
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  brand_voice text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table projects (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  name                text not null,
  brief               text,
  monthly_video_quota int not null default 40,
  monthly_budget_usd  numeric(10,2) not null default 100,
  archived            boolean not null default false,
  created_at          timestamptz not null default now()
);
create index projects_client_idx on projects(client_id);

create table assets (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  kind               asset_kind not null,
  title              text not null,
  status             asset_status not null default 'draft',
  current_version_id uuid,
  created_by         uuid references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index assets_project_idx on assets(project_id);
create index assets_status_idx  on assets(status);

create table asset_versions (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets(id) on delete cascade,
  n           int not null,
  storage_key text,
  text_body   text,
  provider    text,
  model       text,
  prompt      text,
  params      jsonb not null default '{}'::jsonb,
  cost_usd    numeric(10,4) not null default 0,
  duration_s  numeric(8,2),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (asset_id, n)
);
create index asset_versions_asset_idx on asset_versions(asset_id);
create index asset_versions_time_idx  on asset_versions(created_at);

alter table assets
  add constraint assets_current_version_fk
  foreign key (current_version_id) references asset_versions(id) on delete set null;

create or replace function set_version_number() returns trigger
language plpgsql as $$
begin
  if new.n is null then
    select coalesce(max(n),0)+1 into new.n from asset_versions where asset_id = new.asset_id;
  end if;
  return new;
end $$;

create trigger asset_versions_number
  before insert on asset_versions
  for each row execute function set_version_number();

-- Block edits to generated output. Regenerate creates a new row instead.
create or replace function freeze_version() returns trigger
language plpgsql as $$
begin
  if new.storage_key is distinct from old.storage_key
     or new.params  is distinct from old.params
     or new.asset_id is distinct from old.asset_id then
    raise exception 'asset_versions are immutable; insert a new version';
  end if;
  return new;
end $$;

create trigger asset_versions_freeze
  before update on asset_versions
  for each row execute function freeze_version();

create table comments (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references asset_versions(id) on delete cascade,
  author_id  uuid references profiles(id),
  body       text not null,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_version_idx on comments(version_id);

create table approvals (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references asset_versions(id) on delete cascade,
  approver_id uuid references profiles(id),
  decision    decision not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index approvals_version_idx on approvals(version_id);

create table generation_jobs (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid references asset_versions(id) on delete set null,
  asset_id        uuid not null references assets(id) on delete cascade,
  provider        text not null,
  model           text not null,
  state           job_state not null default 'queued',
  provider_job_id text,
  request         jsonb not null default '{}'::jsonb,
  error           text,
  cost_usd        numeric(10,4) not null default 0,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index generation_jobs_state_idx    on generation_jobs(state);
create index generation_jobs_provider_idx on generation_jobs(provider_job_id);

create view project_spend_current_month as
select
  p.id   as project_id,
  p.name as project_name,
  p.monthly_budget_usd,
  p.monthly_video_quota,
  coalesce(sum(v.cost_usd) filter (where v.created_at >= date_trunc('month', now())), 0) as spent_usd,
  count(v.id) filter (where a.kind = 'video' and v.created_at >= date_trunc('month', now())) as video_renders
from projects p
left join assets a         on a.project_id = p.id
left join asset_versions v on v.asset_id = a.id
group by p.id;
