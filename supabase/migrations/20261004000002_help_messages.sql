-- Help assistant history. One row per message; a thread is a conversation the
-- person started with "New chat". Private to its owner.

create table if not exists help_messages (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  thread_id  uuid not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- The page the question was asked on, so an old answer keeps its context.
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists help_messages_thread_idx
  on help_messages(user_id, thread_id, created_at);
create index if not exists help_messages_recent_idx
  on help_messages(user_id, created_at desc);

alter table help_messages enable row level security;

drop policy if exists help_messages_own_read on help_messages;
create policy help_messages_own_read on help_messages for select
  using (user_id = auth.uid());

drop policy if exists help_messages_own_write on help_messages;
create policy help_messages_own_write on help_messages for insert
  with check (user_id = auth.uid());

drop policy if exists help_messages_own_delete on help_messages;
create policy help_messages_own_delete on help_messages for delete
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
