-- Private bucket for uploaded reference PDFs.
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

create policy "team reads sources"
  on storage.objects for select
  using (bucket_id = 'sources' and auth.uid() is not null);

create policy "creators upload sources"
  on storage.objects for insert
  with check (bucket_id = 'sources' and can_create());

create policy "admins delete sources"
  on storage.objects for delete
  using (bucket_id = 'sources' and is_admin());
