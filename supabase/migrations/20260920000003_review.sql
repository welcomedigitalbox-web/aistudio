-- Review :: submit, approve, and the notification that connects the two.
--
-- lab_chapters already had `approved`. What it did not have was a way for a
-- creator to say "this one is finished, look at it" -- so approval depended on
-- a reviewer happening to open the right page. A queue and a badge replace the
-- happening.

alter table lab_chapters
  add column if not exists submitted_at  timestamptz,
  add column if not exists submitted_by  uuid references profiles(id),
  add column if not exists approved_at   timestamptz,
  add column if not exists approved_by   uuid references profiles(id),
  add column if not exists review_note   text;

-- ---------------------------------------------------------- notifications ---

create table notifications (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null
             check (kind in ('review_requested', 'approved',
                             'changes_requested', 'shared')),
  title      text not null,
  body       text,
  -- Where clicking it should land.
  href       text,
  lab_id     uuid references lab_projects(id) on delete cascade,
  chapter_id uuid references lab_chapters(id) on delete cascade,
  series_id  uuid references series(id)       on delete cascade,
  actor_id   uuid references profiles(id),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_inbox_idx
  on notifications(user_id, read_at, created_at desc);

alter table notifications enable row level security;

create policy notifications_read on notifications for select
  using (user_id = auth.uid());

-- Marking your own as read is the only write a client needs; everything else
-- is inserted by a trigger running as definer.
create policy notifications_mark on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------- triggers ---

-- Submitting a chapter notifies whoever can sign it off: the lab's reviewers,
-- plus the owner if nobody has been named yet -- better a message to the wrong
-- desk than a chapter that sits unread because no reviewer was ever assigned.
create or replace function notify_on_submit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lab_title text;
  recipients uuid[];
begin
  if new.submitted_at is null or old.submitted_at is not null then
    return new;
  end if;

  select title into lab_title from lab_projects where id = new.lab_id;

  select coalesce(array_agg(distinct a.user_id), '{}')
    into recipients
    from lab_access a
   where a.lab_id = new.lab_id and a.access = 'reviewer';

  if array_length(recipients, 1) is null then
    select array[created_by] into recipients
      from lab_projects where id = new.lab_id and created_by is not null;
  end if;

  insert into notifications (user_id, kind, title, body, href, lab_id, chapter_id, actor_id)
  select r, 'review_requested',
         'Chapter ' || new.n || ' needs review',
         lab_title || ' — ' || coalesce(new.title, 'untitled'),
         '/lab/' || new.lab_id,
         new.lab_id, new.id, new.submitted_by
    from unnest(recipients) r
   where r <> coalesce(new.submitted_by, '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end $$;

drop trigger if exists trg_notify_submit on lab_chapters;
create trigger trg_notify_submit
  after update of submitted_at on lab_chapters
  for each row execute function notify_on_submit();

-- The decision travels back the other way.
create or replace function notify_on_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lab_title text;
  author uuid := coalesce(new.submitted_by,
                          (select created_by from lab_projects where id = new.lab_id));
begin
  if new.approved = old.approved then return new; end if;
  if author is null or author = new.approved_by then return new; end if;

  select title into lab_title from lab_projects where id = new.lab_id;

  insert into notifications (user_id, kind, title, body, href, lab_id, chapter_id, actor_id)
  values (
    author,
    case when new.approved then 'approved' else 'changes_requested' end,
    'Chapter ' || new.n ||
      case when new.approved then ' approved' else ' sent back' end,
    coalesce(new.review_note, lab_title),
    '/lab/' || new.lab_id,
    new.lab_id, new.id, new.approved_by
  );
  return new;
end $$;

drop trigger if exists trg_notify_decision on lab_chapters;
create trigger trg_notify_decision
  after update of approved on lab_chapters
  for each row execute function notify_on_decision();

-- Being given access is worth knowing about too, or the share is silent.
create or replace function notify_on_share() returns trigger
language plpgsql security definer set search_path = public as $$
declare lab_title text;
begin
  select title into lab_title from lab_projects where id = new.lab_id;
  insert into notifications (user_id, kind, title, body, href, lab_id, actor_id)
  values (new.user_id, 'shared',
          'Shared with you: ' || lab_title,
          'You have ' || new.access || ' access.',
          '/lab/' || new.lab_id, new.lab_id, new.granted_by);
  return new;
end $$;

drop trigger if exists trg_notify_share on lab_access;
create trigger trg_notify_share
  after insert on lab_access
  for each row execute function notify_on_share();

-- ----------------------------------------------------------- review queue ---

-- What is on my desk, oldest first. RLS on lab_chapters already limits this
-- to labs the viewer can see, so the view needs no filter of its own beyond
-- the submitted/unapproved test.
create view review_queue with (security_invoker = true) as
select
  c.id           as chapter_id,
  c.lab_id,
  l.title        as lab_title,
  c.n,
  c.title        as chapter_title,
  length(c.body) as body_length,
  c.submitted_at,
  c.submitted_by,
  p.email        as submitted_by_email,
  p.full_name    as submitted_by_name,
  now() - c.submitted_at as waiting
from lab_chapters c
join lab_projects l on l.id = c.lab_id
left join profiles p on p.id = c.submitted_by
where c.submitted_at is not null
  and c.approved = false;
