-- Connections between everything: offers and requests, documents, groups, tasks and initiatives can be
--   1. sent as a card into a chat, a group's talk or the marketplace (messages.ref_*, posts.ref_*),
--   2. added to any group's collection, groups too, so groups nest (group_items),
--   3. given separate rights for reading and writing (offers, requests, tasks; documents have their own since stage 6):
--      only me, specific people, the group, anyone with the link, everyone.

-- ───────────────────────── what a card can point to ─────────────────────────
create or replace function app.is_ref_type(p text) returns boolean
language sql immutable as $$ select p in ('listing', 'resource', 'group', 'task', 'initiative') $$;

-- Whether the caller may see the object: asked through row level security, so it is exactly what they could open.
create or replace function app.ref_readable(p_type text, p_id uuid) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  return case p_type
    when 'listing' then exists (select 1 from public.listings where id = p_id)
    when 'resource' then exists (select 1 from public.resources where id = p_id and trashed_at is null)
    when 'group' then exists (select 1 from public.groups where id = p_id and archived_at is null)
    when 'task' then exists (select 1 from public.tasks where id = p_id)
    when 'initiative' then exists (select 1 from public.initiatives where id = p_id)
    else false end;
end $$;
grant execute on function app.is_ref_type(text), app.ref_readable(text, uuid) to anon, authenticated, hivevoice_server;

alter table public.messages add column if not exists ref_type text, add column if not exists ref_id uuid;
alter table public.messages add constraint messages_ref check ((ref_type is null) = (ref_id is null) and (ref_type is null or app.is_ref_type(ref_type)));
alter table public.posts add column if not exists ref_type text, add column if not exists ref_id uuid;
alter table public.posts add constraint posts_ref check ((ref_type is null) = (ref_id is null) and (ref_type is null or app.is_ref_type(ref_type)));

-- Only what one may see can be passed on (otherwise a card would reveal that something exists).
create or replace function app.trg_ref_readable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ref_id is not null and (tg_op = 'INSERT' or new.ref_id is distinct from old.ref_id) and not app.ref_readable(new.ref_type, new.ref_id) then
    raise exception 'not_found';
  end if;
  return new;
end $$;
create trigger ref_readable before insert or update on public.messages for each row execute function app.trg_ref_readable();
create trigger ref_readable before insert or update on public.posts for each row execute function app.trg_ref_readable();

-- ───────────────────────── group collections, nested groups ─────────────────────────
create table if not exists public.group_items (
  group_id uuid not null references public.groups(id) on delete cascade,
  item_type text not null check (app.is_ref_type(item_type)),
  item_id uuid not null,
  added_by uuid references public.profiles(id) on delete set null,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (group_id, item_type, item_id),
  check (not (item_type = 'group' and item_id = group_id))
);
create index if not exists group_items_item_idx on public.group_items (item_type, item_id);
alter table public.group_items enable row level security;
create policy read on public.group_items for select using (app.can_read_group(group_id));
create policy add on public.group_items for insert to authenticated with check (
  added_by = app.uid() and app.has_group_permission(group_id, 'post') and app.ref_readable(item_type, item_id));
create policy remove on public.group_items for delete to authenticated using (
  added_by = app.uid() or app.group_role(group_id) in ('admin', 'maintainer'));
grant select on public.group_items to anon, authenticated;
grant insert, delete on public.group_items to authenticated;

-- ───────────────────────── reading and writing, separately ─────────────────────────
alter table public.listings
  add column if not exists read_scope text not null default 'public' check (read_scope in ('me', 'people', 'group', 'link', 'public')),
  add column if not exists write_scope text not null default 'me' check (write_scope in ('me', 'people', 'group', 'link', 'public')),
  add column if not exists link_token text;
alter table public.tasks
  add column if not exists read_scope text not null default 'group' check (read_scope in ('me', 'people', 'group', 'link', 'public')),
  add column if not exists write_scope text not null default 'group' check (write_scope in ('me', 'people', 'group', 'link', 'public')),
  add column if not exists link_token text;
grant select (read_scope, write_scope) on public.listings to anon, authenticated;

-- Specific people, each with reading or also writing.
create table if not exists public.object_grants (
  object_type text not null check (object_type in ('listing', 'task')),
  object_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  can_write boolean not null default false,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (object_type, object_id, profile_id)
);
alter table public.object_grants enable row level security;

create or replace function app.object_manageable(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'listing' then exists (select 1 from public.listings where id = p_id and owner_id = app.uid())
    when 'task' then exists (select 1 from public.tasks t where t.id = p_id
                             and (t.created_by = app.uid() or app.group_role(t.group_id) in ('admin', 'maintainer')))
    else false end
$$;

-- the person concerned and whoever manages the object see the grants; changes only through app.grant_object
create policy read on public.object_grants for select to authenticated using (profile_id = app.uid() or app.object_manageable(object_type, object_id));
grant select on public.object_grants to authenticated;

-- The rule for both kinds: owner (or task creator, or a group admin for tasks) always; otherwise by scope.
create or replace function app.object_access(p_type text, p_id uuid, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.uid(); rs text; ws text; scope text; tok text; owner uuid; gid uuid;
begin
  if p_type = 'listing' then
    select read_scope, write_scope, link_token, owner_id, group_id into rs, ws, tok, owner, gid from public.listings where id = p_id;
  elsif p_type = 'task' then
    select read_scope, write_scope, link_token, created_by, group_id into rs, ws, tok, owner, gid from public.tasks where id = p_id;
  else
    return false;
  end if;
  if rs is null then return false; end if;
  if me is not null and owner = me then return true; end if;
  if p_type = 'task' and me is not null and app.group_role(gid) in ('admin', 'maintainer') then return true; end if;
  if p_write and (me is null or not app.is_verified()) then return false; end if;
  -- writing implies reading, so a reader is checked against both scopes
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
grant execute on function app.object_access(text, uuid, boolean), app.object_manageable(text, uuid) to anon, authenticated, hivevoice_server;

-- Listings: everyone reads what is public (as before), the rest by scope. Writers may change the content, not the rights.
drop policy if exists read on public.listings;
create policy read on public.listings for select using (
  owner_id = app.uid()
  or (status in ('active', 'paused', 'closed') and (read_scope = 'public' or app.object_access('listing', id, false))));
drop policy if exists edit_own on public.listings;
create policy edit on public.listings for update to authenticated using (owner_id = app.uid() or app.object_access('listing', id, true))
  with check (owner_id = app.uid() or app.object_access('listing', id, true));

-- Tasks: by default exactly as before (group readers read, "edit tasks" writes).
drop policy if exists read on public.tasks;
create policy read on public.tasks for select using (
  (read_scope = 'group' and app.can_read_group(group_id)) or app.object_access('task', id, false));
drop policy if exists edit on public.tasks;
create policy insert on public.tasks for insert to authenticated with check (app.has_group_permission(group_id, 'edit_tasks'));
create policy edit on public.tasks for update to authenticated
  using ((write_scope = 'group' and app.has_group_permission(group_id, 'edit_tasks')) or app.object_access('task', id, true))
  with check (true);
create policy remove on public.tasks for delete to authenticated
  using (created_by = app.uid() or app.group_role(group_id) in ('admin', 'maintainer')
         or (write_scope = 'group' and app.has_group_permission(group_id, 'edit_tasks')));
revoke update on public.tasks from authenticated;
grant update (title, status, due_date, position, goal_id, completed_at, hourly_rate_cents) on public.tasks to authenticated;

-- Writers of a listing edit through save_listing (the owner keeps prices, place and rights).
create or replace function app.save_listing(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); lid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        cat text := coalesce(nullif(p ->> 'category', ''), 'help'); fields jsonb := coalesce(p -> 'attrs', '{}'::jsonb);
begin
  if gid is not null and not app.profile_has_group_permission(me, gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(fields) <> 'object' then raise exception 'invalid' using errcode = '23514'; end if;
  if lid is null then
    insert into public.listings (kind, owner_id, group_id, title, description, details_private, pay_mode, hourly_rate_cents,
                                 fixed_price_cents, swap_text, region_id, location_text, schedule_text, is_recurring, seats,
                                 seeking_allies, status, category, attrs)
    values ((p ->> 'kind')::public.listing_kind, me, gid, trim(p ->> 'title'), p ->> 'description', p ->> 'details_private',
            coalesce((p ->> 'pay_mode')::public.pay_mode, 'free'), nullif(p ->> 'hourly_rate_cents', '')::int,
            nullif(p ->> 'fixed_price_cents', '')::int, nullif(p ->> 'swap_text', ''), nullif(p ->> 'region_id', '')::uuid,
            nullif(p ->> 'location_text', ''), nullif(p ->> 'schedule_text', ''), coalesce((p ->> 'is_recurring')::boolean, false),
            nullif(p ->> 'seats', '')::int, coalesce((p ->> 'seeking_allies')::boolean, false),
            coalesce((p ->> 'status')::public.listing_status, 'active'), cat, fields)
    returning id into lid;
  else
    if not exists (select 1 from public.listings where id = lid and owner_id = me) and not app.object_access('listing', lid, true) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    update public.listings set
      title = coalesce(trim(p ->> 'title'), title), description = coalesce(p ->> 'description', description),
      status = case when owner_id = me then coalesce((p ->> 'status')::public.listing_status, status) else status end,
      category = coalesce(nullif(p ->> 'category', ''), category), attrs = coalesce(p -> 'attrs', attrs)
    where id = lid;
    delete from public.listing_tags where listing_id = lid and p ? 'tags';
  end if;
  if p ? 'tags' then
    insert into public.listing_tags (listing_id, tag_id)
      select lid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(p -> 'tags')))) on conflict do nothing;
  end if;
  return lid;
end $$;

-- Setting the rights: only whoever manages the object.
create or replace function app.set_object_access(p_type text, p_id uuid, p_read text, p_write text) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if not app.object_manageable(p_type, p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_read not in ('me', 'people', 'group', 'link', 'public') or p_write not in ('me', 'people', 'group', 'link', 'public') then
    raise exception 'invalid' using errcode = '23514';
  end if;
  -- writing is never wider than reading
  if array_position(array['me', 'people', 'group', 'link', 'public'], p_write) > array_position(array['me', 'people', 'group', 'link', 'public'], p_read) then
    raise exception 'write_wider_than_read' using errcode = '23514';
  end if;
  if p_type = 'listing' then
    if (p_read = 'group' or p_write = 'group') and (select group_id from public.listings where id = p_id) is null then raise exception 'no_group' using errcode = '23514'; end if;
    update public.listings set read_scope = p_read, write_scope = p_write,
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
    'title', case p_type when 'listing' then (select title from public.listings where id = p_id) else (select title from public.tasks where id = p_id) end));
end $$;

create or replace function app.revoke_object(p_type text, p_id uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.object_manageable(p_type, p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.object_grants where object_type = p_type and object_id = p_id and profile_id = p_profile;
end $$;
grant execute on function app.set_object_access(text, uuid, text, text), app.grant_object(text, uuid, uuid, boolean),
  app.revoke_object(text, uuid, uuid) to authenticated, hivevoice_server;

-- New listings only tell others about matches when everyone may read them.
create or replace function app.notify_listing_matches(p_listing uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); l public.listings; m record; n int := 0;
begin
  select * into l from public.listings where id = p_listing and owner_id = me and status = 'active' and read_scope = 'public';
  if not found then return 0; end if;
  for m in select x.id, x.score, o.owner_id, o.title from app.listing_matches(p_listing, 20) x join public.listings o on o.id = x.id
           where x.score >= 6 and not app.is_blocked_between(me, o.owner_id) order by x.score desc loop
    continue when exists (select 1 from public.notifications where profile_id = m.owner_id and kind = 'listing_match'
                          and payload ->> 'listing_id' = p_listing::text and payload ->> 'for_listing_id' = m.id::text);
    perform app.notify(m.owner_id, 'listing_match', jsonb_build_object(
      'listing_id', l.id, 'kind', l.kind, 'title', l.title, 'for_listing_id', m.id, 'for_title', m.title));
    n := n + 1;
    exit when n >= 5;
  end loop;
  return n;
end $$;
