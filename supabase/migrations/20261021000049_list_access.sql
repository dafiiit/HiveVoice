-- To-do lists use the same access model as listings and tasks: reading and writing set apart
-- (only me, specific people, anyone with the link, everyone), instead of "private or public" only.
alter table public.todo_lists
  add column if not exists read_scope text not null default 'me' check (read_scope in ('me', 'people', 'group', 'link', 'public')),
  add column if not exists write_scope text not null default 'me' check (write_scope in ('me', 'people', 'group', 'link', 'public')),
  add column if not exists link_token text;
update public.todo_lists set read_scope = 'public' where visibility = 'public';

drop policy if exists read on public.todo_lists;
drop policy if exists read on public.todo_items;
drop policy if exists own on public.todo_items;
alter table public.todo_lists drop column visibility;

alter table public.object_grants drop constraint if exists object_grants_object_type_check;
alter table public.object_grants add constraint object_grants_object_type_check check (object_type in ('listing', 'task', 'list'));

create or replace function app.object_manageable(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'listing' then exists (select 1 from public.listings where id = p_id and owner_id = app.uid())
    when 'list' then exists (select 1 from public.todo_lists where id = p_id and owner_id = app.uid())
    when 'task' then exists (select 1 from public.tasks t where t.id = p_id
                             and (t.created_by = app.uid() or app.group_role(t.group_id) in ('admin', 'maintainer')))
    else false end
$$;

create or replace function app.object_access(p_type text, p_id uuid, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.uid(); rs text; ws text; scope text; tok text; owner uuid; gid uuid;
begin
  if p_type = 'listing' then
    select read_scope, write_scope, link_token, owner_id, group_id into rs, ws, tok, owner, gid from public.listings where id = p_id;
  elsif p_type = 'task' then
    select read_scope, write_scope, link_token, created_by, group_id into rs, ws, tok, owner, gid from public.tasks where id = p_id;
  elsif p_type = 'list' then
    select read_scope, write_scope, link_token, owner_id into rs, ws, tok, owner from public.todo_lists where id = p_id;
  else
    return false;
  end if;
  if rs is null then return false; end if;
  if me is not null and owner = me then return true; end if;
  if p_type = 'task' and me is not null and app.group_role(gid) in ('admin', 'maintainer') then return true; end if;
  if p_write and (me is null or not app.is_verified()) then return false; end if;
  foreach scope in array case when p_write then array[ws] else array[rs, ws] end loop
    if scope = 'public' and (not p_write or me is not null) then return true; end if;
    if scope = 'link' and tok is not null and tok = current_setting('app.link_token', true) then return true; end if;
    if scope = 'group' and gid is not null then
      if p_write and p_type = 'listing' and app.has_group_permission(gid, 'post') then return true; end if;
      if p_write and p_type = 'task' and app.has_group_permission(gid, 'edit_tasks') then return true; end if;
      if not p_write and app.can_read_group(gid) then return true; end if;
    end if;
    if scope = 'people' and me is not null and exists (
        select 1 from public.object_grants g where g.object_type = p_type and g.object_id = p_id and g.profile_id = me and (g.can_write or not p_write)) then
      return true;
    end if;
  end loop;
  return false;
end $$;

create policy read on public.todo_lists for select using (owner_id = app.uid() or app.object_access('list', id, false));
create policy read on public.todo_items for select using (app.object_access('list', list_id, false));
create policy write on public.todo_items for all to authenticated
  using (app.object_access('list', list_id, true)) with check (app.object_access('list', list_id, true));

create or replace function app.set_object_access(p_type text, p_id uuid, p_read text, p_write text) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if not app.object_manageable(p_type, p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_read not in ('me', 'people', 'group', 'link', 'public') or p_write not in ('me', 'people', 'group', 'link', 'public') then
    raise exception 'invalid' using errcode = '23514';
  end if;
  if array_position(array['me', 'people', 'group', 'link', 'public'], p_write) > array_position(array['me', 'people', 'group', 'link', 'public'], p_read) then
    raise exception 'write_wider_than_read' using errcode = '23514';
  end if;
  if p_type = 'listing' then
    if (p_read = 'group' or p_write = 'group') and (select group_id from public.listings where id = p_id) is null then raise exception 'no_group' using errcode = '23514'; end if;
    update public.listings set read_scope = p_read, write_scope = p_write,
      link_token = case when 'link' in (p_read, p_write) then coalesce(link_token, replace(gen_random_uuid()::text, '-', '')) end
    where id = p_id returning link_token into tok;
  elsif p_type = 'list' then
    if 'group' in (p_read, p_write) then raise exception 'no_group' using errcode = '23514'; end if;
    update public.todo_lists set read_scope = p_read, write_scope = p_write, updated_at = now(),
      link_token = case when 'link' in (p_read, p_write) then coalesce(link_token, replace(gen_random_uuid()::text, '-', '')) end
    where id = p_id returning link_token into tok;
  else
    update public.tasks set read_scope = p_read, write_scope = p_write,
      link_token = case when 'link' in (p_read, p_write) then coalesce(link_token, replace(gen_random_uuid()::text, '-', '')) end
    where id = p_id returning link_token into tok;
  end if;
  return tok;
end $$;

create or replace function app.grant_object(p_type text, p_id uuid, p_profile uuid, p_write boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.object_manageable(p_type, p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_profile = app.uid() then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.object_grants (object_type, object_id, profile_id, can_write, granted_by)
  values (p_type, p_id, p_profile, p_write, app.uid())
  on conflict (object_type, object_id, profile_id) do update set can_write = excluded.can_write;
  perform app.notify(p_profile, 'object_shared', jsonb_build_object('type', p_type, 'id', p_id, 'write', p_write,
    'title', case p_type when 'listing' then (select title from public.listings where id = p_id)
                         when 'list' then (select title from public.todo_lists where id = p_id)
                         else (select title from public.tasks where id = p_id) end));
end $$;

-- Lists are not readable by the link token as a column.
revoke select on public.todo_lists from anon, authenticated;
grant select (id, owner_id, title, read_scope, write_scope, created_at, updated_at) on public.todo_lists to anon, authenticated;
create or replace function app.list_link_token(p_list uuid) returns text
language sql stable security definer set search_path = '' as $$
  select link_token from public.todo_lists where id = p_list and app.object_manageable('list', p_list)
$$;
grant execute on function app.list_link_token(uuid) to authenticated, hivevoice_server;

-- A list can travel as a card too (chat, group, pinboard).
create or replace function app.is_ref_type(p text) returns boolean
language sql immutable as $$ select p in ('listing', 'resource', 'group', 'task', 'initiative', 'list') $$;
create or replace function app.ref_readable(p_type text, p_id uuid) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  return case p_type
    when 'listing' then exists (select 1 from public.listings where id = p_id)
    when 'resource' then exists (select 1 from public.resources where id = p_id and trashed_at is null)
    when 'group' then exists (select 1 from public.groups where id = p_id and archived_at is null)
    when 'task' then exists (select 1 from public.tasks where id = p_id)
    when 'initiative' then exists (select 1 from public.initiatives where id = p_id)
    when 'list' then exists (select 1 from public.todo_lists where id = p_id)
    else false end;
end $$;
