-- Cover photos for groups and initiatives, and a place for demo photos that only admins write.

alter table public.groups add column if not exists cover_path text;
alter table public.initiatives add column if not exists cover_path text;

create or replace function app.is_server_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.server_admins a where a.profile_id = app.uid())
$$;
grant execute on function app.is_server_admin() to authenticated, hivevoice_server;

-- Storage: the folder "demo" of the image bucket belongs to server admins (demo and curated photos).
do $storage$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists hv_images_demo_insert on storage.objects;
    drop policy if exists hv_images_demo_update on storage.objects;
    drop policy if exists hv_images_demo_delete on storage.objects;
    create policy hv_images_demo_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'images' and (storage.foldername(name))[1] = 'demo' and app.is_server_admin());
    create policy hv_images_demo_update on storage.objects for update to authenticated
      using (bucket_id = 'images' and (storage.foldername(name))[1] = 'demo' and app.is_server_admin());
    create policy hv_images_demo_delete on storage.objects for delete to authenticated
      using (bucket_id = 'images' and (storage.foldername(name))[1] = 'demo' and app.is_server_admin());
  end if;
end $storage$;
