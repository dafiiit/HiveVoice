-- Nextcloud: a person or a group connects its own Nextcloud. HiveVoice then shows a calendar of it next to its own dates
-- (CalDAV), a folder of it as a gallery (WebDAV), and can subscribe the Nextcloud calendar to the HiveVoice feed.
-- The connection is made with Nextcloud's Login Flow v2: one confirms in one's own Nextcloud, HiveVoice gets an app password
-- that can be revoked there at any time. Nobody types a Nextcloud password into HiveVoice.
--
-- The app password is kept encrypted in Supabase Vault; the table only holds the id of that secret. No client reads the
-- table: lists go through app.nextcloud_list() (without secrets), and only the app server (hivevoice_server) may ask for
-- the credentials, after it checked with app.nextcloud_access() that the viewer may use the connection.

alter table public.groups drop constraint if exists groups_tools_known;
alter table public.groups add constraint groups_tools_known
  check (tools <@ array['goals', 'links', 'collection', 'needs', 'tasks', 'expenses', 'calendar', 'nextcloud']::text[]);

create table public.nextcloud_links (
  id uuid primary key default gen_random_uuid(),
  -- Who connected it: the app password is theirs.
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- A group's Nextcloud (members see it), or null: the owner's own.
  group_id uuid references public.groups(id) on delete cascade,
  server text not null check (server ~ '^https?://[^/\s]+(/[^\s]*)?$' and length(server) <= 300),
  login_name text not null check (length(login_name) between 1 and 200),
  secret_id uuid not null,
  -- The calendar shown in HiveVoice (its CalDAV address, below the server) and its name.
  calendar_path text check (calendar_path is null or (calendar_path ~ '^/remote\.php/dav/calendars/' and length(calendar_path) <= 500)),
  calendar_name text check (calendar_name is null or length(calendar_name) <= 200),
  -- The folder shown as a gallery, below the files of the login ("Fotos/Garten").
  folder text check (folder is null or (length(folder) <= 500 and folder !~ '(^|/)\.\.(/|$)')),
  -- The CalDAV address of the subscription to the HiveVoice feed made in Nextcloud, to remove it again.
  subscription_path text check (subscription_path is null or subscription_path ~ '^/remote\.php/dav/calendars/'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One own Nextcloud per person, one per group.
create unique index nextcloud_links_own on public.nextcloud_links (owner_id) where group_id is null;
create unique index nextcloud_links_group on public.nextcloud_links (group_id) where group_id is not null;

alter table public.nextcloud_links enable row level security;
revoke all on public.nextcloud_links from public, anon, authenticated;

-- Who may use a connection: its owner; for a group's, every member.
create or replace function app.nextcloud_access(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.nextcloud_links l
    where l.id = p_id and (
      (l.group_id is null and l.owner_id = app.uid())
      or (l.group_id is not null and app.group_role(l.group_id) is not null and app.group_role(l.group_id) <> 'guest')
    )
  )
$$;

-- Who may change or remove it: its owner, and for a group's the group's admins.
create or replace function app.nextcloud_can_manage(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.nextcloud_links l
    where l.id = p_id and (l.owner_id = app.uid() or (l.group_id is not null and app.group_role(l.group_id) = 'admin'))
  )
$$;

-- The connections the viewer can see (own, and those of the groups one is in), without any secret.
create or replace function app.nextcloud_list()
returns table (id uuid, group_id uuid, owner_id uuid, owner_name text, server text, login_name text, calendar_path text,
               calendar_name text, folder text, subscribed boolean, can_manage boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.group_id, l.owner_id, p.display_name, l.server, l.login_name, l.calendar_path, l.calendar_name, l.folder,
         l.subscription_path is not null, app.nextcloud_can_manage(l.id)
  from public.nextcloud_links l join public.profiles p on p.id = l.owner_id
  where app.nextcloud_access(l.id)
$$;

-- Connects (a new app password from the login flow) or changes what is shown. Keys: id (to change), group_id, server,
-- login_name, app_password (only when connecting), calendar_path, calendar_name, folder, subscription_path.
create or replace function app.nextcloud_save(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); lid uuid := nullif(p->>'id', '')::uuid; gid uuid := nullif(p->>'group_id', '')::uuid; sid uuid; old uuid;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if lid is null then
    if gid is not null and app.group_role(gid) is distinct from 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
    if coalesce(p->>'app_password', '') = '' then raise exception 'invalid' using errcode = '23514'; end if;
    sid := vault.create_secret(p->>'app_password', null, 'Nextcloud app password (HiveVoice)');
    -- Connecting again replaces the old connection (and forgets its password).
    select l.id, l.secret_id into lid, old from public.nextcloud_links l
      where (gid is null and l.group_id is null and l.owner_id = me) or (gid is not null and l.group_id = gid);
    if lid is not null then
      update public.nextcloud_links set owner_id = me, server = p->>'server', login_name = p->>'login_name', secret_id = sid,
        calendar_path = null, calendar_name = null, folder = null, subscription_path = null, updated_at = now() where id = lid;
      delete from vault.secrets where id = old;
    else
      insert into public.nextcloud_links (owner_id, group_id, server, login_name, secret_id)
      values (me, gid, p->>'server', p->>'login_name', sid) returning id into lid;
    end if;
    return lid;
  end if;
  if not app.nextcloud_can_manage(lid) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.nextcloud_links set
    calendar_path = case when p ? 'calendar_path' then nullif(p->>'calendar_path', '') else calendar_path end,
    calendar_name = case when p ? 'calendar_name' then nullif(p->>'calendar_name', '') else calendar_name end,
    folder = case when p ? 'folder' then nullif(trim(both '/' from p->>'folder'), '') else folder end,
    subscription_path = case when p ? 'subscription_path' then nullif(p->>'subscription_path', '') else subscription_path end,
    updated_at = now()
  where id = lid;
  return lid;
end $$;

-- Disconnects and forgets the app password (the app server revokes it in Nextcloud first).
create or replace function app.nextcloud_remove(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not app.nextcloud_can_manage(p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.nextcloud_links where id = p_id returning secret_id into sid;
  delete from vault.secrets where id = sid;
end $$;

-- The app server only: what it needs to talk to Nextcloud. It calls app.nextcloud_access() as the viewer before.
create or replace function app.nextcloud_credentials(p_id uuid)
returns table (server text, login_name text, app_password text, calendar_path text, folder text, subscription_path text)
language sql stable security definer set search_path = '' as $$
  select l.server, l.login_name, s.decrypted_secret, l.calendar_path, l.folder, l.subscription_path
  from public.nextcloud_links l join vault.decrypted_secrets s on s.id = l.secret_id
  where l.id = p_id
$$;

revoke execute on function app.nextcloud_credentials(uuid) from public, anon, authenticated;
grant execute on function app.nextcloud_credentials(uuid) to hivevoice_server;
revoke execute on function app.nextcloud_save(jsonb), app.nextcloud_remove(uuid), app.nextcloud_list(), app.nextcloud_access(uuid), app.nextcloud_can_manage(uuid) from public, anon;
grant execute on function app.nextcloud_save(jsonb), app.nextcloud_remove(uuid), app.nextcloud_list(), app.nextcloud_access(uuid), app.nextcloud_can_manage(uuid) to authenticated, hivevoice_server;

-- Chats with tools: Nextcloud is one of them too.
create or replace function app.chat_tools(p_conversation uuid, p_tools text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); gid uuid; s text; names text;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_tools, '{}')) t where t not in ('goals', 'tasks', 'links', 'collection', 'needs', 'expenses', 'calendar', 'nextcloud')) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  select id, slug::text into gid, s from public.groups where conversation_id = p_conversation;
  if gid is null then
    if cardinality(coalesce(p_tools, '{}')) = 0 then return null; end if;
    select string_agg(split_part(p.display_name, ' ', 1), ' & ' order by p.display_name) into names
      from public.conversation_participants cp join public.profiles p on p.id = cp.profile_id where cp.conversation_id = p_conversation;
    insert into public.groups (slug, name, kind, visibility, join_policy, mod_tasks, created_by, owner_id, template, tools, conversation_id)
    values (app.unique_group_slug('chat ' || names), names, 'project', 'secret', 'invite', true, me, me, 'project', p_tools, p_conversation)
    returning id, slug::text into gid, s;
    insert into public.group_members (group_id, profile_id, role)
      select gid, cp.profile_id, 'admin' from public.conversation_participants cp where cp.conversation_id = p_conversation;
    perform app.seed_group_permissions(gid, 'project');
  else
    update public.groups set tools = coalesce(p_tools, '{}') where id = gid;
  end if;
  return s;
end $$;
