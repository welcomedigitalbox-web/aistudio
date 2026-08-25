-- Series structure :: the character bible lives at SERIES level, not episode.
-- That is the whole point. Reference images generated once and reused across
-- every episode are what keeps a character looking like the same person in
-- episode 8 as in episode 1.

create type episode_state as enum (
  'outline',      -- premise only
  'scripted',     -- scene plan + script done
  'shot_listed',  -- broken into shots
  'in_production',-- keyframes / clips generating
  'cut',          -- assembled
  'published'
);

create type ref_kind as enum ('character', 'location', 'prop', 'style');

create table series (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  title        text not null,
  premise      text,
  -- The rules that hold across every episode: tone, visual language, what the
  -- show never does. Fed to every agent on every episode.
  bible        text,
  target_minutes int not null default 15,
  language     text not null default 'en',
  archived     boolean not null default false,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index series_project_idx on series(project_id);

-- Reference images. Generated once per series, passed as the start frame or
-- reference to every keyframe and clip that features this subject.
create table refs (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references series(id) on delete cascade,
  kind        ref_kind not null,
  name        text not null,              -- "Maya", "the apartment", "night palette"
  description text,                       -- prompt fragment reused verbatim
  -- The chosen image. Alternates stay in ref_images until one is picked.
  chosen_image_id uuid,
  -- Voice binding for characters. Null for locations and props.
  voice_provider text,
  voice_id       text,
  voice_settings jsonb,
  created_at  timestamptz not null default now(),
  unique (series_id, kind, name)
);
create index refs_series_idx on refs(series_id);

-- Several angles/variants per subject. A character needs front, 3/4, profile,
-- and at least one expression before it is usable as a reference set.
create table ref_images (
  id          uuid primary key default gen_random_uuid(),
  ref_id      uuid not null references refs(id) on delete cascade,
  angle       text,                        -- "front", "three-quarter", "profile", "smiling"
  storage_key text not null,
  prompt      text,
  model       text,
  cost_usd    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now()
);
create index ref_images_ref_idx on ref_images(ref_id);

alter table refs
  add constraint refs_chosen_image_fk
  foreign key (chosen_image_id) references ref_images(id) on delete set null;

create table episodes (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references series(id) on delete cascade,
  n            int not null,
  title        text not null,
  premise      text,
  state        episode_state not null default 'outline',
  -- Links back into the writer room documents for this episode.
  plan_id      uuid references story_docs(id) on delete set null,
  script_id    uuid references story_docs(id) on delete set null,
  runtime_seconds int,
  cost_usd     numeric(10,4) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (series_id, n)
);
create index episodes_series_idx on episodes(series_id);

-- A shot is the unit that actually gets generated. One keyframe, one clip,
-- optionally one VO line. Scenes are a writing concept; shots are a
-- production one.
create table shots (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references episodes(id) on delete cascade,
  n           int not null,
  scene_n     int,
  slug        text,
  -- What the shot shows, written as an image prompt.
  visual      text not null,
  -- What moves, written as a motion prompt for image-to-video.
  motion      text,
  -- Which refs appear, so the generator knows which images to pass through.
  ref_ids     uuid[] not null default '{}',
  -- Dialogue for this shot, if any. Drives VO and lip sync.
  speaker     text,
  line        text,
  -- Filled by the audio stage, then used to set the clip length. VO first,
  -- video second -- generating a 5s clip for a 7s line means paying twice.
  vo_storage_key text,
  vo_seconds     numeric(6,2),
  target_seconds numeric(6,2) not null default 5,
  -- Production output
  keyframe_storage_key text,
  clip_storage_key     text,
  approved    boolean not null default false,
  cost_usd    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now(),
  unique (episode_id, n)
);
create index shots_episode_idx on shots(episode_id);
create index shots_approved_idx on shots(approved);

-- ---------- RLS ----------
alter table series     enable row level security;
alter table refs       enable row level security;
alter table ref_images enable row level security;
alter table episodes   enable row level security;
alter table shots      enable row level security;

create policy series_read   on series for select using (auth.uid() is not null);
create policy series_write  on series for all using (can_create()) with check (can_create());

create policy refs_read   on refs for select using (auth.uid() is not null);
create policy refs_write  on refs for all using (can_create()) with check (can_create());

create policy ref_images_read   on ref_images for select using (auth.uid() is not null);
create policy ref_images_write  on ref_images for all using (can_create()) with check (can_create());

create policy episodes_read   on episodes for select using (auth.uid() is not null);
create policy episodes_write  on episodes for all using (can_create()) with check (can_create());

create policy shots_read   on shots for select using (auth.uid() is not null);
create policy shots_write  on shots for all using (can_create()) with check (can_create());

-- ---------- rollup ----------
create view episode_progress as
select
  e.id as episode_id,
  e.series_id,
  e.n,
  e.title,
  e.state,
  count(s.id)                                    as shots_total,
  count(s.id) filter (where s.keyframe_storage_key is not null) as keyframes_done,
  count(s.id) filter (where s.clip_storage_key is not null)     as clips_done,
  count(s.id) filter (where s.approved)                         as shots_approved,
  coalesce(sum(s.cost_usd), 0) + e.cost_usd                     as cost_usd
from episodes e
left join shots s on s.episode_id = e.id
group by e.id;
