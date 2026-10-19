-- Rights, stage 1: trust levels, one table of rules and limits, vouching, sanctions (write pauses and bans) and an audit log.
--
-- Levels: 0 guest, 1 account, 2 verified, 3 official, 4 admin. "Verified" depends on the instance setting
-- verification_mode: login (test phase: every login counts), vouch (two verified people vouch, account at least a day old)
-- or eid (only a confirmed identity). Federated profiles stay at level 1.

-- ───────────────────── sanctions: write pauses and bans ─────────────────────
create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pause', 'ban')),
  reason text,
  case_id uuid,                                   -- the jury case, set in stage 7
  created_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                            -- null: until lifted
  lifted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.sanctions (profile_id, starts_at desc);
alter table public.sanctions enable row level security;
create policy own on public.sanctions for select to authenticated using (profile_id = app.uid());
grant select on public.sanctions to authenticated;

create or replace function app.is_banned(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sanctions s
                 where s.profile_id = p_profile and s.lifted_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now()))
$$;

-- ───────────────────── vouching ─────────────────────
create table public.vouches (
  voucher_id uuid not null references public.profiles(id) on delete cascade,
  vouched_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (voucher_id, vouched_id),
  check (voucher_id <> vouched_id)
);
create index on public.vouches (vouched_id);
alter table public.vouches enable row level security;
create policy own on public.vouches for select to authenticated using (voucher_id = app.uid() or vouched_id = app.uid());
grant select on public.vouches to authenticated;

alter table public.profiles add column if not exists invited_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists invited_at timestamptz;

-- ───────────────────── trust level ─────────────────────
create or replace function app.trust_level_in_mode(p_profile uuid, p_mode text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; ok boolean;
begin
  if p_profile is null then return 0; end if;
  select * into pr from public.profiles where id = p_profile;
  if not found then return 0; end if;
  if exists (select 1 from public.server_admins where profile_id = p_profile) then return 4; end if;
  if pr.origin_instance_id is not null then return 1; end if;
  ok := pr.is_verified
        or (p_mode = 'login' and pr.auth_user_id is not null)
        or (p_mode = 'vouch' and pr.auth_user_id is not null and pr.created_at < now() - interval '24 hours'
            and (select count(*) from public.vouches v where v.vouched_id = p_profile) >= 2);
  if ok and exists (select 1 from public.responsibilities r
                    where r.holder_id = p_profile and r.is_official and r.official_verified_at > now() - interval '12 months') then
    return 3;
  end if;
  return case when ok then 2 else 1 end;
end $$;

create or replace function app.trust_level(p_profile uuid) returns int
language sql stable as $$ select app.trust_level_in_mode(p_profile, app.verification_mode()) $$;

-- "Verified" now means level 2 or more and not currently paused or banned. Everything that wrote with require_verified keeps working.
create or replace function app.profile_is_verified(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.trust_level(p_profile) >= 2 and not app.is_banned(p_profile)
$$;

create or replace function app.require_verified() returns uuid
language plpgsql stable as $$
declare v uuid := app.uid();
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if app.is_banned(v) then raise exception 'banned' using errcode = '42501'; end if;
  if app.trust_level(v) < 2 then raise exception 'not_verified' using errcode = '42501'; end if;
  return v;
end $$;

-- ───────────────────── the table of rules and limits ─────────────────────
create table public.action_rules (
  action text primary key,
  min_level smallint not null check (min_level between 0 and 4),
  limit_l1 int,                                   -- per window for level 1 (null: unlimited)
  limit_l2 int,                                   -- per window for level 2 and above
  window_hours int not null default 24
);
alter table public.action_rules enable row level security;
create policy read_all on public.action_rules for select using (true);
grant select on public.action_rules to anon, authenticated;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values
  ('read', 0, null, null, 24),
  ('react', 1, null, null, 24),
  ('message', 1, 100, 500, 24),
  ('post', 1, 20, 60, 24),
  ('contact_request', 1, 5, 20, 24),
  ('group_join', 1, 10, 30, 24),
  ('upload', 1, 10, 50, 24),
  ('vouch', 2, null, null, 24),
  ('group_create', 2, 1, 3, 24),
  ('group_invite', 2, 10, 50, 24),
  ('initiative_create', 2, null, 5, 24),
  ('initiative_support', 2, null, null, 24),
  ('vote', 2, null, null, 24),
  ('listing_create', 2, null, 20, 24),
  ('share', 2, 10, 30, 24),
  ('report', 2, 10, 20, 24),
  ('jury', 2, null, null, 24),
  ('responsibility_self', 2, null, null, 24),
  ('responsibility_official', 3, null, null, 24),
  ('moderate_platform', 4, null, null, 24),
  ('admin', 4, null, null, 24)
on conflict (action) do nothing;

create table public.action_log (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  at timestamptz not null default now()
);
create index on public.action_log (profile_id, action, at desc);
alter table public.action_log enable row level security;           -- no policy: only the database functions read it

-- Does the person reach the level of this action? (No limit check, nothing is counted.)
create or replace function app.can_act(p_action text) returns boolean
language sql stable as $$
  select coalesce((select app.trust_level(app.uid()) >= r.min_level and (r.min_level = 0 or not app.is_banned(app.uid()))
                   from public.action_rules r where r.action = p_action), false)
$$;

-- Counts one use of the action and refuses when the daily limit is reached. Accounts under a day old get half.
create or replace function app.check_limit(p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.action_rules; lvl int; lim int; used int;
begin
  if me is null then return; end if;
  select * into r from public.action_rules where action = p_action;
  if not found then return; end if;
  lvl := app.trust_level(me);
  if lvl >= 4 then return; end if;
  lim := case when lvl <= 1 then r.limit_l1 else r.limit_l2 end;
  if lim is not null then
    if exists (select 1 from public.profiles where id = me and created_at > now() - interval '24 hours') then lim := greatest(1, lim / 2); end if;
    select count(*) into used from public.action_log where profile_id = me and action = p_action and at > now() - make_interval(hours => r.window_hours);
    if used >= lim then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  insert into public.action_log (profile_id, action) values (me, p_action);
end $$;

-- Level, limit and ban in one go, for forms that explain themselves.
create or replace function app.require_action(p_action text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.action_rules;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.action_rules where action = p_action;
  if not found then raise exception 'invalid' using errcode = '23514'; end if;
  if r.min_level > 0 and app.is_banned(me) then raise exception 'banned' using errcode = '42501'; end if;
  if app.trust_level(me) < r.min_level then raise exception 'level_required' using errcode = '42501'; end if;
  perform app.check_limit(p_action);
  return me;
end $$;

-- Why can't I? One answer per action for the signed-in person (the rights page and the forms use it).
create or replace function app.explain(p_action text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.action_rules; lvl int := app.trust_level(app.uid()); lim int; used int; reason text;
begin
  select * into r from public.action_rules where action = p_action;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'unknown'); end if;
  lim := case when lvl <= 1 then r.limit_l1 else r.limit_l2 end;
  if lim is not null and me is not null and exists (select 1 from public.profiles where id = me and created_at > now() - interval '24 hours') then lim := greatest(1, lim / 2); end if;
  select count(*) into used from public.action_log where profile_id = me and action = p_action and at > now() - make_interval(hours => r.window_hours);
  reason := case when me is null and r.min_level > 0 then 'not_authenticated'
                 when r.min_level > 0 and app.is_banned(me) then 'banned'
                 when lvl < r.min_level then 'level_required'
                 when lim is not null and used >= lim then 'rate_limited' end;
  return jsonb_build_object('allowed', reason is null, 'reason', reason, 'level', lvl, 'min_level', r.min_level, 'limit', lim, 'used', used);
end $$;

-- The signed-in person's standing: level, mode, vouches, sanctions and how much of each daily limit is used.
create or replace function app.my_rights() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.uid(); lvl int := app.trust_level(app.uid());
begin
  return jsonb_build_object(
    'level', lvl, 'mode', app.verification_mode(),
    'vouches', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by v.created_at)
                         from public.vouches v join public.profiles p on p.id = v.voucher_id where v.vouched_id = me), '[]'::jsonb),
    'vouches_given', (select count(*) from public.vouches where voucher_id = me and created_at > now() - interval '30 days'),
    'account_age_hours', (select floor(extract(epoch from now() - created_at) / 3600) from public.profiles where id = me),
    'sanction', (select jsonb_build_object('kind', s.kind, 'ends_at', s.ends_at, 'reason', s.reason) from public.sanctions s
                 where s.profile_id = me and s.lifted_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
                 order by s.starts_at desc limit 1),
    'actions', coalesce((select jsonb_agg(app.explain(a.action) || jsonb_build_object('action', a.action) order by a.min_level, a.action)
                         from public.action_rules a where a.action not in ('read', 'react')), '[]'::jsonb));
end $$;

-- ───────────────────── vouching: functions ─────────────────────
create or replace function app.vouch_for(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified();
begin
  if p_profile = me then raise exception 'own_profile'; end if;
  if not exists (select 1 from public.profiles where id = p_profile and auth_user_id is not null and origin_instance_id is null) then raise exception 'not_found'; end if;
  if (select count(*) from public.vouches where voucher_id = me and created_at > now() - interval '30 days') >= 5 then raise exception 'rate_limited'; end if;
  insert into public.vouches (voucher_id, vouched_id) values (me, p_profile) on conflict do nothing;
  perform app.notify(p_profile, 'vouched', jsonb_build_object('by', (select display_name from public.profiles where id = me)));
  perform app.audit('vouch', 'profile', p_profile, null, '{}'::jsonb);
end $$;

create or replace function app.unvouch(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.vouches where voucher_id = me and vouched_id = p_profile;
  perform app.audit('unvouch', 'profile', p_profile, null, '{}'::jsonb);
end $$;

-- ───────────────────── audit log ─────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  object_type text not null,
  object_id uuid,
  group_id uuid references public.groups(id) on delete cascade,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (group_id, created_at desc) where group_id is not null;
create index on public.audit_log (actor_id, created_at desc);
alter table public.audit_log enable row level security;
create policy read on public.audit_log for select to authenticated using (
  actor_id = app.uid()
  or (group_id is not null and app.group_role(group_id) = 'admin')
  or app.trust_level(app.uid()) >= 4);
grant select on public.audit_log to authenticated;

create or replace function app.audit(p_action text, p_type text, p_object uuid, p_group uuid, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, object_type, object_id, group_id, detail)
  values (app.uid(), p_action, p_type, p_object, p_group, coalesce(p_detail, '{}'::jsonb))
$$;

-- ───────────────────── limits wired into what people write ─────────────────────
create or replace function app.trg_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.check_limit(tg_argv[0]);
  return new;
end $$;
create trigger limit_posts before insert on public.posts for each row execute function app.trg_limit('post');
create trigger limit_messages before insert on public.messages for each row execute function app.trg_limit('message');
create trigger limit_contact before insert on public.contact_requests for each row execute function app.trg_limit('contact_request');
create trigger limit_join before insert on public.group_join_requests for each row execute function app.trg_limit('group_join');
create trigger limit_upload before insert on public.attachments for each row execute function app.trg_limit('upload');

-- Links, files and notes share one daily limit (replaces the fixed 30 a day).
create or replace function app.share_resource(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('share'); rid uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
begin
  if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  insert into public.resources (owner_id, group_id, url, host, provider, kind, title, description, preview, safety, safety_notes, region_id)
  values (me, gid, p ->> 'url', lower(p ->> 'host'), coalesce(p ->> 'provider', 'web'), coalesce(p ->> 'kind', 'page'),
          left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''),
          coalesce(p -> 'preview', '{}'::jsonb), coalesce(p ->> 'safety', 'checked'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'notes', '[]'::jsonb))), '{}'),
          coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)))
  returning id into rid;
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;

create or replace function app.share_file(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('share'); rid uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid; mt text := p #>> '{file,mime}';
begin
  if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  insert into public.resources (owner_id, group_id, url, host, provider, kind, origin, title, description, preview, safety, region_id)
  values (me, gid, null, 'hivevoice', 'upload',
          case when mt like 'image/%' then 'image' when mt = 'application/pdf' then 'pdf' else 'file' end, 'file',
          left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''),
          jsonb_build_object('file_name', p #>> '{file,name}', 'mime', mt), 'trusted',
          coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)))
  returning id into rid;
  perform app.add_extras('resource', rid, jsonb_build_array(p -> 'file'), null);
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;

create or replace function app.save_note(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        body text := coalesce(p ->> 'body', '');
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  if char_length(body) < 1 or char_length(body) > 100000 then raise exception 'invalid' using errcode = '23514'; end if;
  if rid is null then
    perform app.require_action('share');
    if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
    insert into public.resources (owner_id, group_id, url, host, provider, kind, origin, title, description, body_md, preview, safety, region_id)
    values (me, gid, null, 'hivevoice', 'note', 'note', 'note', left(trim(p ->> 'title'), 200),
            nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), body, '{}'::jsonb, 'trusted',
            coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)))
    returning id into rid;
  else
    update public.resources set title = left(trim(p ->> 'title'), 200), body_md = body,
           description = nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), updated_at = now()
     where id = rid and owner_id = me and origin = 'note';
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
    delete from public.resource_tags where resource_id = rid;
  end if;
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;

-- Groups: one per day at level 1... the real rule is level 2, at most three new groups with no other member, and the daily limit.
create or replace function app.create_group(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('group_create'); gid uuid;
begin
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'name_required'; end if;
  if (select count(*) from public.groups g where g.created_by = me and g.archived_at is null
        and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id <> me)) >= 3 then
    raise exception 'too_many_empty_groups';
  end if;
  insert into public.groups (slug, name, summary, description, kind, visibility, join_policy, region_id,
                             mod_tasks, mod_files, mod_funding, mod_official, created_by)
  values (app.unique_group_slug(p ->> 'name'), trim(p ->> 'name'), p ->> 'summary', p ->> 'description',
          coalesce((p ->> 'kind')::public.group_kind, 'project'),
          coalesce((p ->> 'visibility')::public.visibility, 'public'),
          coalesce((p ->> 'join_policy')::public.join_policy, 'request'),
          nullif(p ->> 'region_id', '')::uuid,
          coalesce((p ->> 'mod_tasks')::boolean, true), false, false,
          coalesce((p ->> 'mod_official')::boolean, false), me)
  returning id into gid;
  insert into public.group_members (group_id, profile_id, role, focus) values (gid, me, 'admin', p ->> 'focus');
  perform app.seed_group_permissions(gid);
  insert into public.group_tags (group_id, tag_id)
    select gid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]')))))
    on conflict do nothing;
  perform app.audit('group_create', 'group', gid, gid, '{}'::jsonb);
  return gid;
end $$;

-- Level 1 accounts (not yet verified) may write in groups with open entry once the account is a day old; nothing else.
create or replace function app.profile_has_group_permission(p_profile uuid, p_group uuid, p_perm public.group_permission)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r public.group_role; h public.perm_holder; v boolean := app.profile_is_verified(p_profile);
begin
  select role into r from public.group_members where group_id = p_group and profile_id = p_profile;
  h := case r when 'maintainer' then 'maintainer'::public.perm_holder
              when 'contributor' then 'contributor'::public.perm_holder
              when 'guest' then 'guest'::public.perm_holder
              else 'public'::public.perm_holder end;
  if p_perm = 'read' then
    if r is not null then
      if r = 'admin' then return true; end if;
    elsif h = 'public' then
      return exists (select 1 from public.groups where id = p_group and visibility = 'public');
    end if;
  elsif not v then
    return p_perm = 'post' and r is not null and r <> 'admin' and not app.is_banned(p_profile)
      and exists (select 1 from public.groups where id = p_group and join_policy = 'open')
      and exists (select 1 from public.profiles where id = p_profile and created_at < now() - interval '24 hours')
      and coalesce((select allowed from public.group_role_permissions where group_id = p_group and holder = h and permission = p_perm), false);
  elsif r = 'admin' then
    return true;
  end if;
  return coalesce((select allowed from public.group_role_permissions
                   where group_id = p_group and holder = h and permission = p_perm), false);
end $$;

grant execute on function app.trust_level(uuid), app.trust_level_in_mode(uuid, text), app.can_act(text), app.explain(text), app.my_rights(),
  app.is_banned(uuid) to anon, authenticated, hivevoice_server;
grant execute on function app.require_action(text), app.check_limit(text), app.vouch_for(uuid), app.unvouch(uuid), app.audit(text, text, uuid, uuid, jsonb)
  to authenticated, hivevoice_server;
