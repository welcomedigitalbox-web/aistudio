-- The live notifications table predates the review migration and is missing
-- columns the inbox reads, so /api/notifications fails with
-- "column notifications.title does not exist" on every poll.
-- Idempotent: safe to run on a table that already has some or all of these.

alter table notifications add column if not exists title      text not null default '';
alter table notifications add column if not exists body       text;
alter table notifications add column if not exists href       text;
alter table notifications add column if not exists lab_id     uuid references lab_projects(id) on delete cascade;
alter table notifications add column if not exists chapter_id uuid references lab_chapters(id) on delete cascade;
alter table notifications add column if not exists series_id  uuid references series(id) on delete cascade;
alter table notifications add column if not exists actor_id   uuid references profiles(id);
alter table notifications add column if not exists read_at    timestamptz;
alter table notifications add column if not exists created_at timestamptz not null default now();

create index if not exists notifications_inbox_idx
  on notifications(user_id, read_at, created_at desc);

-- Tell PostgREST about the new columns now rather than on its next reload.
notify pgrst, 'reload schema';
