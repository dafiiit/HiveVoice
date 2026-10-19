-- Rights, stage 3: groups. Owner and succession, invitations (links and people), visibility tiers,
-- templates, removing members with a reason, handing over, motions to take over or recall, archiving and deleting.
--
-- Visibility: public (everyone reads), members (listed by name and summary, content for members), secret (not listed,
-- only members and invited people see it). Groups that were "members only" before were hidden, so they become secret.

alter table public.groups add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.groups add column if not exists orphaned_at timestamptz;
alter table public.groups add column if not exists delete_requested_at timestamptz;
alter table public.groups add column if not exists template text not null default 'project' check (template in ('project', 'club', 'initiative'));
update public.groups g set visibility = 'secret' where visibility = 'members';
update public.groups g set owner_id = coalesce(
  (select m.profile_id from public.group_members m where m.group_id = g.id and m.profile_id = g.created_by),
  (select m.profile_id from public.group_members m where m.group_id = g.id and m.role = 'admin' order by m.joined_at limit 1))
 where owner_id is null;

create table public.group_bans (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  until timestamptz,                               -- null: for good
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
alter table public.group_bans enable row level security;
create policy own_or_admin on public.group_bans for select to authenticated using (profile_id = app.uid() or app.group_role(group_id) = 'admin');
grant select on public.group_bans to authenticated;

create table public.protected_names (pattern text primary key);          -- like patterns, lower case
insert into public.protected_names (pattern) values
  ('stadt %'), ('gemeinde %'), ('landkreis %'), ('landratsamt%'), ('bundesministerium%'), ('ministerium%'), ('%referat%'), ('rathaus%'),
  ('bürgermeister%'), ('polizei%'), ('cdu%'), ('csu%'), ('spd%'), ('fdp%'), ('afd%'), ('bündnis 90%'), ('die grünen%'), ('die linke%'), ('bsw%')
on conflict do nothing;
alter table public.protected_names enable row level security;
create policy read_all on public.protected_names for select using (true);
grant select on public.protected_names to anon, authenticated;

create or replace function app.check_group_name(p_name text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.trust_level(app.uid()) < 3 and exists (select 1 from public.protected_names n where lower(btrim(p_name)) like n.pattern) then
    raise exception 'name_protected' using errcode = '42501';
  end if;
end $$;

create or replace function app.has_group_invite(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_join_requests r where r.group_id = p_group and r.profile_id = app.uid() and r.direction = 'invite' and r.status = 'pending')
$$;

drop policy if exists read on public.groups;
create policy read on public.groups for select using (visibility in ('public', 'members') or app.group_role(id) is not null or app.has_group_invite(id));

create or replace function app.can_read_group(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups g where g.id = p_group and (g.visibility = 'public' or app.group_role(g.id) is not null))
$$;

-- ───────────────────── templates ─────────────────────
create or replace function app.seed_group_permissions(p_group uuid, p_template text default 'project') returns void
language plpgsql security definer set search_path = '' as $$
declare
  perms public.group_permission[] := enum_range(null::public.group_permission);
  defaults jsonb;
  h text; i int;
begin
  if p_template = 'club' then
    defaults := '{
      "maintainer":  [1,1,1,1,1,1,1,1,0,0],
      "contributor": [1,1,0,1,0,0,0,0,0,0],
      "guest":       [1,0,0,0,0,0,0,0,0,0],
      "public":      [1,0,0,0,0,0,0,0,0,0]}';
  else
    defaults := '{
      "maintainer":  [1,1,1,1,1,1,1,0,0,0],
      "contributor": [1,1,1,1,1,1,0,0,0,0],
      "guest":       [1,1,0,1,0,0,0,0,0,0],
      "public":      [1,0,0,1,0,0,0,0,0,0]}';
  end if;
  for h in select jsonb_object_keys(defaults) loop
    for i in 1 .. array_length(perms, 1) loop
      insert into public.group_role_permissions (group_id, holder, permission, allowed)
      values (p_group, h::public.perm_holder, perms[i], (defaults -> h ->> (i - 1))::int = 1)
      on conflict do nothing;
    end loop;
  end loop;
end $$;

create or replace function app.create_group(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('group_create'); gid uuid; tpl text := coalesce(nullif(p ->> 'template', ''), 'project');
        vis public.visibility := coalesce((p ->> 'visibility')::public.visibility, 'public');
begin
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'name_required'; end if;
  if tpl not in ('project', 'club', 'initiative') then raise exception 'invalid' using errcode = '23514'; end if;
  perform app.check_group_name(p ->> 'name');
  if vis = 'public' then perform app.require_real_name(); end if;
  if (select count(*) from public.groups g where g.created_by = me and g.archived_at is null
        and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id <> me)) >= 3 then
    raise exception 'too_many_empty_groups';
  end if;
  insert into public.groups (slug, name, summary, description, kind, visibility, join_policy, region_id,
                             mod_tasks, mod_files, mod_funding, mod_official, created_by, owner_id, template, adults_only)
  values (app.unique_group_slug(p ->> 'name'), trim(p ->> 'name'), p ->> 'summary', p ->> 'description',
          coalesce((p ->> 'kind')::public.group_kind, 'project'), vis,
          coalesce((p ->> 'join_policy')::public.join_policy, 'request'),
          nullif(p ->> 'region_id', '')::uuid,
          coalesce((p ->> 'mod_tasks')::boolean, true), false, false,
          coalesce((p ->> 'mod_official')::boolean, false), me, me, tpl, coalesce((p ->> 'adults_only')::boolean, false))
  returning id into gid;
  insert into public.group_members (group_id, profile_id, role, focus) values (gid, me, 'admin', p ->> 'focus');
  perform app.seed_group_permissions(gid, tpl);
  insert into public.group_tags (group_id, tag_id)
    select gid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]')))))
    on conflict do nothing;
  perform app.audit('group_create', 'group', gid, gid, jsonb_build_object('template', tpl, 'visibility', vis));
  return gid;
end $$;

-- ───────────────────── joining ─────────────────────
create or replace function app.join_group(p_group uuid, p_message text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('group_join'); g public.groups; inv public.group_join_requests; ban public.group_bans;
begin
  select * into g from public.groups where id = p_group and archived_at is null;
  if not found then raise exception 'group_not_found'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and profile_id = me) then return 'member'; end if;
  select * into ban from public.group_bans where group_id = p_group and profile_id = me and (until is null or until > now());
  if found then raise exception 'banned_from_group' using errcode = '42501'; end if;
  if g.adults_only and (select is_minor from public.profiles where id = me) then raise exception 'adults_only' using errcode = '42501'; end if;
  select * into inv from public.group_join_requests where group_id = p_group and profile_id = me and direction = 'invite' and status = 'pending';
  if found then
    update public.group_join_requests set status = 'accepted', decided_at = now(), decided_by = me where id = inv.id;
    insert into public.group_members (group_id, profile_id, role) values (p_group, me, inv.proposed_role) on conflict do nothing;
    return 'joined';
  end if;
  if g.join_policy = 'invite' then raise exception 'invite_only' using errcode = '42501'; end if;
  if g.join_policy = 'open' then
    insert into public.group_members (group_id, profile_id, role) values (p_group, me, 'contributor');
    return 'joined';
  end if;
  insert into public.group_join_requests (group_id, profile_id, message) values (p_group, me, p_message)
    on conflict do nothing;
  perform app.notify(m.profile_id, 'join_request', jsonb_build_object('group_id', p_group, 'group', g.name, 'slug', g.slug))
    from public.group_members m where m.group_id = p_group and m.role = 'admin';
  return 'requested';
end $$;

-- ───────────────────── invitations ─────────────────────
create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null unique,
  role public.group_role not null default 'contributor',
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  max_uses int check (max_uses is null or max_uses between 1 and 500),
  uses int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.group_invites (group_id);
alter table public.group_invites enable row level security;
create policy managers on public.group_invites for select to authenticated using (app.has_group_permission(group_id, 'manage_members') or created_by = app.uid());
grant select on public.group_invites to authenticated;

-- Who may invite: those who manage members, and any member of a group with open entry.
create or replace function app.may_invite(p_group uuid, p_role public.group_role) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.group_role := app.group_role(p_group); g public.groups;
begin
  select * into g from public.groups where id = p_group and archived_at is null;
  if not found or r is null then return false; end if;
  if p_role = 'admin' then return g.owner_id = me; end if;
  if p_role = 'maintainer' and r <> 'admin' then return false; end if;
  return app.has_group_permission(p_group, 'manage_members') or (g.join_policy = 'open' and app.profile_is_verified(me));
end $$;

create or replace function app.create_invite_link(p_group uuid, p_role public.group_role default 'contributor', p_days int default 7, p_max_uses int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('group_invite'); c text := replace(gen_random_uuid()::text, '-', '');
begin
  if not app.may_invite(p_group, p_role) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.group_invites (group_id, code, role, created_by, expires_at, max_uses)
  values (p_group, c, p_role, me, now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90)), p_max_uses);
  perform app.audit('invite_link', 'group', p_group, p_group, jsonb_build_object('role', p_role));
  return c;
end $$;

create or replace function app.revoke_invite_link(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.group_invites;
begin
  select * into i from public.group_invites where id = p_invite;
  if not found or not (i.created_by = app.uid() or app.has_group_permission(i.group_id, 'manage_members')) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.group_invites set revoked_at = now() where id = p_invite;
end $$;

-- What a link shows before anyone signs in: the group's name, for secret groups nothing more.
create or replace function app.invite_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.group_invites; g public.groups;
begin
  select * into i from public.group_invites where code = p_code;
  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  select * into g from public.groups where id = i.group_id;
  if not found or g.archived_at is not null then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if i.revoked_at is not null then return jsonb_build_object('valid', false, 'reason', 'revoked', 'name', g.name); end if;
  if i.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'expired', 'name', g.name); end if;
  if i.max_uses is not null and i.uses >= i.max_uses then return jsonb_build_object('valid', false, 'reason', 'used_up', 'name', g.name); end if;
  return jsonb_build_object('valid', true, 'name', g.name, 'slug', g.slug, 'role', i.role,
    'summary', case when g.visibility = 'secret' then null else g.summary end,
    'members', case when g.visibility = 'secret' then null else g.member_count end,
    'adults_only', g.adults_only);
end $$;

create or replace function app.accept_invite_link(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('group_join'); i public.group_invites; g public.groups;
begin
  select * into i from public.group_invites where code = p_code for update;
  if not found or i.revoked_at is not null or i.expires_at < now() or (i.max_uses is not null and i.uses >= i.max_uses) then raise exception 'invite_invalid'; end if;
  select * into g from public.groups where id = i.group_id and archived_at is null;
  if not found then raise exception 'group_not_found'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and profile_id = me) then return g.slug::text; end if;
  if exists (select 1 from public.group_bans where group_id = g.id and profile_id = me and (until is null or until > now())) then raise exception 'banned_from_group' using errcode = '42501'; end if;
  if g.adults_only and (select is_minor from public.profiles where id = me) then raise exception 'adults_only' using errcode = '42501'; end if;
  insert into public.group_members (group_id, profile_id, role) values (g.id, me, i.role);
  update public.group_invites set uses = uses + 1 where id = i.id;
  perform app.notify(i.created_by, 'group_invite_used', jsonb_build_object('group', g.name, 'slug', g.slug, 'name', (select display_name from public.profiles where id = me)));
  return g.slug::text;
end $$;

create or replace function app.invite_member(p_group uuid, p_profile uuid, p_role public.group_role default 'contributor', p_message text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('group_invite'); g public.groups; why text;
begin
  if not app.may_invite(p_group, p_role) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.groups where id = p_group;
  if p_profile = me then raise exception 'own_profile'; end if;
  if not exists (select 1 from public.profiles where id = p_profile and onboarded_at is not null) then raise exception 'not_found'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and profile_id = p_profile) then raise exception 'duplicate'; end if;
  why := app.contact_block_reason(me, p_profile, false);
  if why is not null then raise exception '%', why using errcode = '42501'; end if;
  if g.adults_only and (select is_minor from public.profiles where id = p_profile) then raise exception 'adults_only' using errcode = '42501'; end if;
  insert into public.group_join_requests (group_id, profile_id, direction, proposed_role, message, decided_by)
  values (p_group, p_profile, 'invite', p_role, left(trim(coalesce(p_message, '')), 300), me);
  perform app.notify(p_profile, 'group_invite', jsonb_build_object('group', g.name, 'slug', g.slug, 'by', (select display_name from public.profiles where id = me)));
  perform app.audit('invite_member', 'profile', p_profile, p_group, jsonb_build_object('role', p_role));
end $$;

create or replace function app.decide_invite(p_request uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.group_join_requests; g public.groups;
begin
  select * into r from public.group_join_requests where id = p_request and profile_id = me and direction = 'invite' and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  select * into g from public.groups where id = r.group_id;
  update public.group_join_requests set status = case when p_accept then 'accepted'::public.request_status else 'declined'::public.request_status end, decided_at = now() where id = p_request;
  if p_accept then
    perform app.require_action('group_join');
    if exists (select 1 from public.group_bans where group_id = r.group_id and profile_id = me and (until is null or until > now())) then raise exception 'banned_from_group' using errcode = '42501'; end if;
    insert into public.group_members (group_id, profile_id, role) values (r.group_id, me, r.proposed_role) on conflict do nothing;
  end if;
  if r.decided_by is not null then
    perform app.notify(r.decided_by, case when p_accept then 'invite_accepted' else 'invite_declined' end,
                       jsonb_build_object('group', g.name, 'slug', g.slug, 'name', (select display_name from public.profiles where id = me)));
  end if;
  return g.slug::text;
end $$;

-- ───────────────────── roles, members, owner ─────────────────────
create or replace function app.set_member_role(p_group uuid, p_profile uuid, p_role public.group_role) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); my_role public.group_role := app.group_role(p_group); target public.group_role; g public.groups;
begin
  if not app.profile_has_group_permission(me, p_group, 'manage_members') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.groups where id = p_group;
  select role into target from public.group_members where group_id = p_group and profile_id = p_profile;
  if target is null then raise exception 'not_a_member'; end if;
  -- only the owner appoints or removes admins; the owner stays admin until the group is handed over
  if (target = 'admin' or p_role = 'admin') and g.owner_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_profile = g.owner_id and p_role <> 'admin' then raise exception 'owner_must_transfer' using errcode = '42501'; end if;
  if target = 'admin' and p_role <> 'admin'
     and (select count(*) from public.group_members where group_id = p_group and role = 'admin') = 1 then
    raise exception 'last_admin';
  end if;
  update public.group_members set role = p_role where group_id = p_group and profile_id = p_profile;
  perform app.audit('set_role', 'profile', p_profile, p_group, jsonb_build_object('from', target, 'to', p_role));
end $$;

create or replace function app.decide_join_request(p_request uuid, p_accept boolean, p_role public.group_role default 'contributor')
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.group_join_requests; g public.groups;
begin
  select * into r from public.group_join_requests where id = p_request and status = 'pending' and direction = 'request';
  if not found then raise exception 'request_not_found'; end if;
  if not app.profile_has_group_permission(me, r.group_id, 'manage_members') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.groups where id = r.group_id;
  if p_role = 'admin' and g.owner_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_accept and g.adults_only and (select is_minor from public.profiles where id = r.profile_id) then raise exception 'adults_only' using errcode = '42501'; end if;
  update public.group_join_requests set status = case when p_accept then 'accepted'::public.request_status else 'declined'::public.request_status end,
         decided_by = me, decided_at = now() where id = p_request;
  if p_accept then
    insert into public.group_members (group_id, profile_id, role) values (r.group_id, r.profile_id, p_role) on conflict do nothing;
  end if;
  perform app.notify(r.profile_id, case when p_accept then 'join_accepted' else 'join_declined' end,
                     jsonb_build_object('group_id', g.id, 'group', g.name, 'slug', g.slug));
end $$;

-- Removing someone: a reason they get to read, and optionally a ban from coming back.
create or replace function app.remove_member(p_group uuid, p_profile uuid, p_reason text, p_ban text default 'none') returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); target public.group_role; g public.groups;
begin
  select * into g from public.groups where id = p_group;
  select role into target from public.group_members where group_id = p_group and profile_id = p_profile;
  if target is null then return; end if;
  if p_ban not in ('none', '30', 'forever') then raise exception 'invalid' using errcode = '23514'; end if;
  if p_profile = g.owner_id then raise exception 'owner_must_transfer' using errcode = '42501'; end if;
  if p_profile <> me then
    if not app.profile_has_group_permission(me, p_group, 'manage_members') then raise exception 'forbidden' using errcode = '42501'; end if;
    if target = 'admin' and g.owner_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  end if;
  if target = 'admin' and (select count(*) from public.group_members where group_id = p_group and role = 'admin') = 1 then
    raise exception 'last_admin';
  end if;
  delete from public.group_members where group_id = p_group and profile_id = p_profile;
  if p_profile <> me then
    if p_ban <> 'none' then
      insert into public.group_bans (group_id, profile_id, until, reason, created_by)
      values (p_group, p_profile, case when p_ban = '30' then now() + interval '30 days' end, left(btrim(p_reason), 300), me)
      on conflict (group_id, profile_id) do update set until = excluded.until, reason = excluded.reason, created_by = excluded.created_by, created_at = now();
    end if;
    perform app.notify(p_profile, 'group_removed', jsonb_build_object('group', g.name, 'slug', g.slug, 'reason', left(btrim(p_reason), 300), 'ban', p_ban));
    perform app.audit('remove_member', 'profile', p_profile, p_group, jsonb_build_object('reason', p_reason, 'ban', p_ban));
  end if;
end $$;
create or replace function app.remove_member(p_group uuid, p_profile uuid) returns void
language sql security definer set search_path = '' as $$ select app.remove_member(p_group, p_profile, null, 'none') $$;

-- ───────────────────── succession: when the owner is gone ─────────────────────
create or replace function app.succeed_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.groups; next_owner uuid;
begin
  select * into g from public.groups where id = p_group;
  if not found then return; end if;
  if g.owner_id is not null and exists (select 1 from public.group_members where group_id = p_group and profile_id = g.owner_id) then
    if g.orphaned_at is not null then update public.groups set orphaned_at = null where id = p_group; end if;
    return;
  end if;
  select profile_id into next_owner from public.group_members where group_id = p_group and role = 'admin' order by joined_at limit 1;
  if next_owner is null then
    select profile_id into next_owner from public.group_members where group_id = p_group and role = 'maintainer' order by joined_at limit 1;
    if next_owner is not null then update public.group_members set role = 'admin' where group_id = p_group and profile_id = next_owner; end if;
  end if;
  if next_owner is not null then
    update public.groups set owner_id = next_owner, orphaned_at = null where id = p_group;
    perform app.notify(m.profile_id, 'group_owner_changed', jsonb_build_object('group', g.name, 'slug', g.slug, 'name', (select display_name from public.profiles where id = next_owner)))
      from public.group_members m where m.group_id = p_group;
  elsif g.orphaned_at is null and exists (select 1 from public.group_members where group_id = p_group) then
    update public.groups set owner_id = null, orphaned_at = now() where id = p_group;
    perform app.notify(m.profile_id, 'group_orphaned', jsonb_build_object('group', g.name, 'slug', g.slug))
      from public.group_members m where m.group_id = p_group;
  end if;
end $$;

create or replace function app.trg_member_left() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.succeed_group(old.group_id);
  return null;
end $$;
drop trigger if exists member_left on public.group_members;
create trigger member_left after delete on public.group_members for each row execute function app.trg_member_left();

-- ───────────────────── handing a group over ─────────────────────
create table public.group_transfers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'done', 'declined', 'revoked')),
  executes_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index group_transfers_open_idx on public.group_transfers (group_id) where status in ('proposed', 'accepted');
alter table public.group_transfers enable row level security;
create policy involved on public.group_transfers for select to authenticated using (from_id = app.uid() or to_id = app.uid() or app.group_role(group_id) = 'admin');
grant select on public.group_transfers to authenticated;

create or replace function app.propose_transfer(p_group uuid, p_to uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); g public.groups; tid uuid;
begin
  select * into g from public.groups where id = p_group and archived_at is null;
  if not found or g.owner_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_to = me or not exists (select 1 from public.group_members where group_id = p_group and profile_id = p_to and role in ('admin', 'maintainer')) then raise exception 'invalid' using errcode = '23514'; end if;
  if not app.profile_is_verified(p_to) then raise exception 'not_verified' using errcode = '42501'; end if;
  insert into public.group_transfers (group_id, from_id, to_id) values (p_group, me, p_to) returning id into tid;
  perform app.notify(p_to, 'group_transfer_proposed', jsonb_build_object('group', g.name, 'slug', g.slug, 'name', (select display_name from public.profiles where id = me)));
  perform app.audit('transfer_proposed', 'profile', p_to, p_group, '{}'::jsonb);
  return tid;
end $$;

-- Accepting starts a 48 hour window in which the owner can still change their mind.
create or replace function app.respond_transfer(p_transfer uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); t public.group_transfers; g public.groups;
begin
  select * into t from public.group_transfers where id = p_transfer and to_id = me and status = 'proposed';
  if not found then raise exception 'not_found'; end if;
  select * into g from public.groups where id = t.group_id;
  if p_accept then
    update public.group_transfers set status = 'accepted', executes_at = now() + interval '48 hours' where id = p_transfer;
  else
    update public.group_transfers set status = 'declined' where id = p_transfer;
  end if;
  perform app.notify(t.from_id, case when p_accept then 'group_transfer_accepted' else 'group_transfer_declined' end,
                     jsonb_build_object('group', g.name, 'slug', g.slug, 'name', (select display_name from public.profiles where id = me)));
end $$;

create or replace function app.cancel_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.group_transfers;
begin
  select * into t from public.group_transfers where id = p_transfer and status in ('proposed', 'accepted');
  if not found or t.from_id <> app.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.group_transfers set status = 'revoked' where id = p_transfer;
end $$;

create or replace function app.execute_transfers() returns int
language plpgsql security definer set search_path = '' as $$
declare t record; n int := 0; g public.groups;
begin
  for t in select * from public.group_transfers where status = 'accepted' and executes_at <= now() loop
    select * into g from public.groups where id = t.group_id;
    if g.owner_id = t.from_id and exists (select 1 from public.group_members where group_id = t.group_id and profile_id = t.to_id) then
      update public.group_members set role = 'admin' where group_id = t.group_id and profile_id = t.to_id;
      update public.groups set owner_id = t.to_id where id = t.group_id;
      update public.group_transfers set status = 'done' where id = t.id;
      perform app.notify(m.profile_id, 'group_owner_changed', jsonb_build_object('group', g.name, 'slug', g.slug, 'name', (select display_name from public.profiles where id = t.to_id)))
        from public.group_members m where m.group_id = t.group_id;
      n := n + 1;
    else
      update public.group_transfers set status = 'revoked' where id = t.id;
    end if;
  end loop;
  return n;
end $$;

-- ───────────────────── activity, motions to take over or recall ─────────────────────
create or replace function app.last_activity(p_profile uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    (select max(at) from public.action_log where profile_id = p_profile),
    (select max(created_at) from public.posts where author_id = p_profile),
    (select max(created_at) from public.messages where sender_id = p_profile),
    (select created_at from public.profiles where id = p_profile))
$$;

create table public.group_motions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null check (kind in ('takeover', 'recall')),
  subject_id uuid not null references public.profiles(id) on delete cascade,   -- who would take over, or who would be recalled
  opened_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'passed', 'failed', 'cancelled')),
  closes_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index group_motions_open_idx on public.group_motions (group_id) where status = 'open';
create table public.group_motion_votes (
  motion_id uuid not null references public.group_motions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  yes boolean not null,
  primary key (motion_id, profile_id)
);
alter table public.group_motions enable row level security;
alter table public.group_motion_votes enable row level security;
create policy members on public.group_motions for select to authenticated using (app.group_role(group_id) is not null);
create policy own on public.group_motion_votes for select to authenticated using (profile_id = app.uid());
grant select on public.group_motions, public.group_motion_votes to authenticated;

create or replace function app.open_motion(p_group uuid, p_kind text, p_subject uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); g public.groups; subj uuid := coalesce(p_subject, me); mid uuid;
begin
  select * into g from public.groups where id = p_group and archived_at is null;
  if not found or app.group_role(p_group) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'takeover' then
    -- only when nobody leads, or the owner has been silent for 30 days
    if not (g.orphaned_at is not null or g.owner_id is null or app.last_activity(g.owner_id) < now() - interval '30 days') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if not exists (select 1 from public.group_members where group_id = p_group and profile_id = subj) or not app.profile_is_verified(subj) then raise exception 'invalid' using errcode = '23514'; end if;
  elsif p_kind = 'recall' then
    subj := coalesce(p_subject, g.owner_id);
    if subj is null or subj = me or not exists (select 1 from public.group_members where group_id = p_group and profile_id = subj and role = 'admin') then raise exception 'invalid' using errcode = '23514'; end if;
  else raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.group_motions (group_id, kind, subject_id, opened_by, closes_at) values (p_group, p_kind, subj, me, now() + interval '7 days') returning id into mid;
  perform app.notify(m.profile_id, 'group_motion_opened', jsonb_build_object('group', g.name, 'slug', g.slug, 'kind', p_kind))
    from public.group_members m where m.group_id = p_group and m.profile_id <> me;
  perform app.audit('motion_' || p_kind, 'profile', subj, p_group, '{}'::jsonb);
  return mid;
end $$;

create or replace function app.vote_motion(p_motion uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); m public.group_motions;
begin
  select * into m from public.group_motions where id = p_motion and status = 'open' and closes_at > now();
  if not found or app.group_role(m.group_id) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.group_motion_votes (motion_id, profile_id, yes) values (p_motion, me, p_yes)
  on conflict (motion_id, profile_id) do update set yes = excluded.yes;
end $$;

create or replace function app.motion_counts(p_motion uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('yes', count(*) filter (where yes), 'no', count(*) filter (where not yes),
    'members', (select count(*) from public.group_members m join public.group_motions g on g.group_id = m.group_id where g.id = p_motion),
    'mine', (select yes from public.group_motion_votes where motion_id = p_motion and profile_id = app.uid()))
  from public.group_motion_votes where motion_id = p_motion
$$;

-- Takeover: more yes than no and a quarter of the members taking part (at least two). Recall: half of the members take part and two thirds say yes.
create or replace function app.close_motions() returns int
language plpgsql security definer set search_path = '' as $$
declare m record; n int := 0; yes int; no int; total int; passed boolean; g public.groups; next_owner uuid;
begin
  for m in select * from public.group_motions where status = 'open' and closes_at <= now() loop
    select count(*) filter (where v.yes), count(*) filter (where not v.yes) into yes, no from public.group_motion_votes v where v.motion_id = m.id;
    select count(*) into total from public.group_members where group_id = m.group_id;
    select * into g from public.groups where id = m.group_id;
    if m.kind = 'takeover' then
      passed := yes > no and (yes + no) >= greatest(2, ceil(total * 0.25)::int);
    else
      passed := (yes + no) * 2 >= total and yes * 3 >= (yes + no) * 2 and yes > 0;
    end if;
    update public.group_motions set status = case when passed then 'passed' else 'failed' end where id = m.id;
    if passed and m.kind = 'takeover' then
      update public.group_members set role = 'admin' where group_id = m.group_id and profile_id = m.subject_id;
      update public.groups set owner_id = m.subject_id, orphaned_at = null where id = m.group_id;
    elsif passed and m.kind = 'recall' then
      if g.owner_id = m.subject_id then
        select profile_id into next_owner from public.group_members where group_id = m.group_id and role = 'admin' and profile_id <> m.subject_id order by joined_at limit 1;
        update public.group_members set role = 'maintainer' where group_id = m.group_id and profile_id = m.subject_id;
        if next_owner is null then
          update public.groups set owner_id = null, orphaned_at = now() where id = m.group_id;
        else
          update public.groups set owner_id = next_owner where id = m.group_id;
        end if;
      else
        update public.group_members set role = 'maintainer' where group_id = m.group_id and profile_id = m.subject_id and role = 'admin';
      end if;
    end if;
    perform app.notify(x.profile_id, 'group_motion_result', jsonb_build_object('group', g.name, 'slug', g.slug, 'kind', m.kind, 'passed', passed))
      from public.group_members x where x.group_id = m.group_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───────────────────── archive, delete ─────────────────────
create or replace function app.archive_group(p_group uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if not found or app.group_role(p_group) is distinct from 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.groups set archived_at = case when p_on then now() end where id = p_group;
  perform app.audit(case when p_on then 'archive' else 'unarchive' end, 'group', p_group, p_group, '{}'::jsonb);
  if p_on then
    perform app.notify(m.profile_id, 'group_archived', jsonb_build_object('group', g.name, 'slug', g.slug)) from public.group_members m where m.group_id = p_group and m.profile_id <> me;
  end if;
end $$;

create or replace function app.request_delete_group(p_group uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if not found or g.owner_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.groups set delete_requested_at = case when p_on then now() end where id = p_group;
  perform app.audit(case when p_on then 'delete_requested' else 'delete_cancelled' end, 'group', p_group, p_group, '{}'::jsonb);
  if p_on then
    perform app.notify(m.profile_id, 'group_delete_requested', jsonb_build_object('group', g.name, 'slug', g.slug, 'date', (now() + interval '14 days')::date))
      from public.group_members m where m.group_id = p_group and m.profile_id <> me;
  end if;
end $$;

create or replace function app.purge_deleted_groups() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with gone as (delete from public.groups where delete_requested_at is not null and delete_requested_at < now() - interval '14 days' returning 1)
  select count(*) into n from gone;
  return n;
end $$;

create or replace function app.archive_orphans() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with gone as (update public.groups set archived_at = now() where orphaned_at is not null and orphaned_at < now() - interval '30 days' and archived_at is null returning 1)
  select count(*) into n from gone;
  return n;
end $$;

-- ───────────────────── rule changes are logged, and openings are announced ─────────────────────
create or replace function app.trg_group_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare broader boolean := false;
begin
  if new.visibility is distinct from old.visibility or new.join_policy is distinct from old.join_policy
     or new.slow_mode_seconds is distinct from old.slow_mode_seconds or new.adults_only is distinct from old.adults_only then
    perform app.audit('group_rules', 'group', new.id, new.id, jsonb_build_object(
      'visibility', jsonb_build_array(old.visibility, new.visibility), 'join', jsonb_build_array(old.join_policy, new.join_policy),
      'slow', jsonb_build_array(old.slow_mode_seconds, new.slow_mode_seconds), 'adults_only', jsonb_build_array(old.adults_only, new.adults_only)));
    broader := (old.visibility = 'secret' and new.visibility in ('members', 'public')) or (old.visibility = 'members' and new.visibility = 'public')
               or (old.join_policy in ('invite', 'request') and new.join_policy = 'open') or (old.join_policy = 'invite' and new.join_policy = 'request');
    if broader then
      perform app.notify(m.profile_id, 'group_rule_changed', jsonb_build_object('group', new.name, 'slug', new.slug))
        from public.group_members m where m.group_id = new.id and m.profile_id is distinct from app.uid();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists group_rules on public.groups;
create trigger group_rules after update on public.groups for each row execute function app.trg_group_rules();

create or replace function app.trg_perm_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if new.allowed is distinct from old.allowed then
    perform app.audit('group_permission', 'group', new.group_id, new.group_id, jsonb_build_object('holder', new.holder, 'permission', new.permission, 'allowed', new.allowed));
    if new.allowed and new.holder in ('guest', 'public') then
      select * into g from public.groups where id = new.group_id;
      perform app.notify(m.profile_id, 'group_rule_changed', jsonb_build_object('group', g.name, 'slug', g.slug))
        from public.group_members m where m.group_id = new.group_id and m.profile_id is distinct from app.uid();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists perm_rules on public.group_role_permissions;
create trigger perm_rules after update on public.group_role_permissions for each row execute function app.trg_perm_rules();

-- ───────────────────── tick: everything that happens with time ─────────────────────
create or replace function app.tick() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.ballots where status = 'open' and closes_at <= now() loop
    perform app.close_ballot(r.id); n := n + 1;
  end loop;
  perform app.jury_timeouts();
  perform app.purge_expired_messages();
  perform app.execute_transfers();
  perform app.close_motions();
  perform app.archive_orphans();
  perform app.purge_deleted_groups();
  return n;
end $$;

grant execute on function app.check_group_name(text), app.has_group_invite(uuid), app.may_invite(uuid, public.group_role), app.invite_preview(text), app.motion_counts(uuid), app.last_activity(uuid)
  to anon, authenticated, hivevoice_server;
grant execute on function app.create_invite_link(uuid, public.group_role, int, int), app.revoke_invite_link(uuid), app.accept_invite_link(text),
  app.invite_member(uuid, uuid, public.group_role, text), app.decide_invite(uuid, boolean), app.set_member_role(uuid, uuid, public.group_role),
  app.decide_join_request(uuid, boolean, public.group_role), app.remove_member(uuid, uuid, text, text), app.remove_member(uuid, uuid),
  app.propose_transfer(uuid, uuid), app.respond_transfer(uuid, boolean), app.cancel_transfer(uuid), app.open_motion(uuid, text, uuid),
  app.vote_motion(uuid, boolean), app.archive_group(uuid, boolean), app.request_delete_group(uuid, boolean), app.create_group(jsonb), app.join_group(uuid, text)
  to authenticated, hivevoice_server;
