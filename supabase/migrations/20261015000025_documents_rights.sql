-- Rights, stage 6: documents (Wissen: notes, files, links).
--   visibility (only me / invited / group / anyone with the link / public), four levels of rights per person or group
--   (view, comment and suggest, edit, manage) that can expire, an edit mode per document (only me / the group edits /
--   suggestions that somebody approves), a version for every change and a way back, download and copy switches with a
--   licence, ownership hand-over, a trash with 30 days, storage quotas, and a 5 minute lock while somebody edits.

-- ───────────────────────── numbers ─────────────────────────
insert into public.rule_params (key, value, description) values
  ('quota_l1_mb', 100, 'Storage per person who is only signed in (MB)'),
  ('quota_l2_mb', 500, 'Storage per verified person (MB)'),
  ('quota_group_mb', 2048, 'Storage per group (MB)'),
  ('trash_days', 30, 'Days a deleted document stays in the trash'),
  ('lock_minutes', 5, 'Minutes a document stays locked for the person who edits it'),
  ('doc_transfer_days', 14, 'Days a hand-over of a document stays open')
on conflict (key) do nothing;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values
  ('resource_suggest', 2, null, 20, 24),
  ('resource_comment', 2, null, 60, 24)
on conflict (action) do nothing;

-- ───────────────────────── columns ─────────────────────────
alter table public.resources
  add column visibility text check (visibility in ('me', 'invited', 'group', 'link', 'public')),
  add column edit_mode text not null default 'me' check (edit_mode in ('me', 'group', 'suggest')),
  add column allow_download boolean,
  add column license text check (license in ('all_rights', 'cc_by', 'cc_by_sa', 'cc0')),
  add column link_token text,
  add column trashed_at timestamptz,
  add column copied_from uuid references public.resources(id) on delete set null,
  add column version_no int not null default 1;

update public.resources set visibility = case when group_id is null then 'public' else 'group' end;
update public.resources r set allow_download = (r.group_id is null or exists (select 1 from public.groups g where g.id = r.group_id and g.visibility = 'public'));
update public.resources set license = 'all_rights' where origin in ('note', 'file') and visibility = 'public';
alter table public.resources alter column visibility set not null, alter column allow_download set not null;
create index on public.resources (trashed_at) where trashed_at is not null;
create unique index on public.resources (link_token) where link_token is not null;

alter table public.attachments add column scan_status text not null default 'unscanned' check (scan_status in ('unscanned', 'clean', 'infected'));

-- Defaults when a document is created: in a group it is for the group, elsewhere public; public notes are CC BY-SA unless the author said otherwise.
create or replace function app.trg_resource_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility is null then new.visibility := case when new.group_id is not null then 'group' else 'public' end; end if;
  if new.allow_download is null then
    new.allow_download := new.visibility in ('public', 'link') or new.group_id is null
      or exists (select 1 from public.groups g where g.id = new.group_id and g.visibility = 'public');
  end if;
  if new.license is null and new.origin <> 'link' and new.visibility = 'public' then
    new.license := case when new.origin = 'note' then 'cc_by_sa' else 'all_rights' end;
  end if;
  if new.visibility = 'link' and new.link_token is null then new.link_token := replace(gen_random_uuid()::text, '-', ''); end if;
  return new;
end $$;
create trigger defaults before insert on public.resources for each row execute function app.trg_resource_defaults();

-- ───────────────────────── rights per person or group ─────────────────────────
create table public.resource_grants (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  level text not null check (level in ('view', 'comment', 'edit', 'manage')),
  expires_at timestamptz,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(profile_id, group_id) = 1)
);
create unique index on public.resource_grants (resource_id, profile_id) where profile_id is not null;
create unique index on public.resource_grants (resource_id, group_id) where group_id is not null;

-- 0 none, 1 view, 2 comment and suggest, 3 edit, 4 manage. Whoever holds a link sees it when the link is passed along (app.link_token).
create or replace function app.resource_level(p_res uuid, p_profile uuid default app.uid()) returns int
language plpgsql stable security definer set search_path = '' as $$
declare r public.resources; lvl int := 0; granted int; readable boolean := false;
begin
  select * into r from public.resources where id = p_res;
  if not found then return 0; end if;
  if p_profile is not null and r.owner_id = p_profile then return 4; end if;
  if r.trashed_at is not null or r.hidden_at is not null then
    -- the managers of a group still see what was thrown away
    if r.group_id is not null and p_profile is not null and exists (
         select 1 from public.group_members m where m.group_id = r.group_id and m.profile_id = p_profile and m.role in ('admin', 'maintainer')) then return 4; end if;
    return 0;
  end if;
  if r.group_id is not null and p_profile is not null then
    if exists (select 1 from public.group_members m where m.group_id = r.group_id and m.profile_id = p_profile and m.role in ('admin', 'maintainer')) then return 4; end if;
    if r.edit_mode = 'group' and app.profile_has_group_permission(p_profile, r.group_id, 'edit_files') then lvl := 3; end if;
  end if;
  select max(case g.level when 'view' then 1 when 'comment' then 2 when 'edit' then 3 else 4 end) into granted
    from public.resource_grants g
   where g.resource_id = p_res and (g.expires_at is null or g.expires_at > now())
     and (g.profile_id = p_profile or (g.group_id is not null and p_profile is not null and exists (
            select 1 from public.group_members m where m.group_id = g.group_id and m.profile_id = p_profile and m.role <> 'guest')));
  lvl := greatest(lvl, coalesce(granted, 0));
  readable := lvl >= 1 or r.visibility = 'public'
    or (r.visibility = 'group' and r.group_id is not null and app.can_read_group(r.group_id))
    or (r.visibility = 'link' and r.link_token is not null and r.link_token = current_setting('app.link_token', true));
  if not readable then return 0; end if;
  lvl := greatest(lvl, 1);
  if r.edit_mode = 'suggest' and lvl < 2 and p_profile is not null and app.profile_is_verified(p_profile) then lvl := 2; end if;
  return lvl;
end $$;

drop policy if exists read on public.resources;
create policy read on public.resources for select using (app.resource_level(id) >= 1);
drop policy if exists edit_own on public.resources;
revoke update (title, description) on public.resources from authenticated;

alter table public.resource_grants enable row level security;
create policy visible on public.resource_grants for select to authenticated using (profile_id = app.uid() or app.resource_level(resource_id) >= 4);
grant select on public.resource_grants to authenticated;

-- A file can be read when the document can be read; a link-only document opens its files for whoever knows the (unguessable) path.
create or replace function app.can_read_attachment(p_message uuid, p_post uuid, p_resource uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_message is not null then exists (
      select 1 from public.messages m where m.id = p_message and app.is_participant(m.conversation_id))
    when p_post is not null then exists (
      select 1 from public.posts p where p.id = p_post
        and (p.hidden_at is null or p.author_id = app.uid()) and (p.group_id is null or app.can_read_group(p.group_id)))
    when p_resource is not null then app.resource_level(p_resource) >= 1
    else false end
$$;

create or replace function app.can_read_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attachments a where a.path = p_path
                 and (app.can_read_attachment(a.message_id, a.post_id, a.resource_id)
                      or exists (select 1 from public.resources r where r.id = a.resource_id and r.visibility = 'link'
                                 and r.trashed_at is null and r.hidden_at is null)))
$$;

-- Download and copy: a switch per document, the managers and editors always can.
create or replace function app.attachment_download_allowed(p_attachment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when a.resource_id is null then true
                               else r.allow_download or app.resource_level(r.id) >= 3 end
                     from public.attachments a left join public.resources r on r.id = a.resource_id where a.id = p_attachment), false)
$$;

-- ───────────────────────── who may do what with a document ─────────────────────────
create or replace function app.can_approve_resource(p_res uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.resource_level(p_res) >= 4
      or exists (select 1 from public.resources r where r.id = p_res and r.group_id is not null
                 and app.profile_has_group_permission(app.uid(), r.group_id, 'approve_changes'))
$$;

create or replace function app.set_resource_access(p_res uuid, p_visibility text, p_edit_mode text, p_allow_download boolean, p_license text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.resources;
begin
  select * into r from public.resources where id = p_res for update;
  if not found then raise exception 'not_found'; end if;
  if app.resource_level(p_res) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_visibility not in ('me', 'invited', 'group', 'link', 'public') or p_edit_mode not in ('me', 'group', 'suggest')
     or (p_license is not null and p_license not in ('all_rights', 'cc_by', 'cc_by_sa', 'cc0')) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  if p_visibility = 'group' and r.group_id is null then raise exception 'invalid' using errcode = '23514'; end if;
  if p_edit_mode = 'group' and r.group_id is null then raise exception 'invalid' using errcode = '23514'; end if;
  if p_visibility = 'public' and r.origin <> 'link' and p_license is null then raise exception 'license_required'; end if;
  update public.resources set visibility = p_visibility, edit_mode = p_edit_mode, allow_download = p_allow_download,
         license = case when p_visibility = 'public' or p_license is not null then p_license else license end,
         link_token = case when p_visibility = 'link' then coalesce(link_token, replace(gen_random_uuid()::text, '-', '')) end
   where id = p_res;
  perform app.audit('resource_access', 'resource', p_res, r.group_id,
    jsonb_build_object('visibility', p_visibility, 'edit_mode', p_edit_mode, 'download', p_allow_download, 'license', p_license));
end $$;

-- A new link makes the old one useless.
create or replace function app.renew_resource_link(p_res uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_verified();
  if app.resource_level(p_res) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.resources set link_token = replace(gen_random_uuid()::text, '-', '') where id = p_res and visibility = 'link';
end $$;

create or replace function app.grant_resource(p_res uuid, p_profile uuid, p_group uuid, p_level text, p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.resources;
begin
  select * into r from public.resources where id = p_res;
  if not found or app.resource_level(p_res) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_level not in ('view', 'comment', 'edit', 'manage') or num_nonnulls(p_profile, p_group) <> 1 or (p_expires is not null and p_expires <= now()) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  if p_profile = r.owner_id then raise exception 'invalid' using errcode = '23514'; end if;
  if p_profile is not null then
    if app.contact_block_reason(me, p_profile) is not null and not app.shares_group(me, p_profile) then raise exception 'blocked' using errcode = '42501'; end if;
    insert into public.resource_grants (resource_id, profile_id, level, expires_at, granted_by) values (p_res, p_profile, p_level, p_expires, me)
    on conflict (resource_id, profile_id) where profile_id is not null do update set level = excluded.level, expires_at = excluded.expires_at, granted_by = me;
    perform app.notify(p_profile, 'resource_shared', jsonb_build_object('resource_id', r.id, 'title', r.title, 'level', p_level,
      'by', (select display_name from public.profiles where id = me)));
  else
    if not exists (select 1 from public.groups where id = p_group) then raise exception 'not_found'; end if;
    insert into public.resource_grants (resource_id, group_id, level, expires_at, granted_by) values (p_res, p_group, p_level, p_expires, me)
    on conflict (resource_id, group_id) where group_id is not null do update set level = excluded.level, expires_at = excluded.expires_at, granted_by = me;
  end if;
  perform app.audit('resource_grant', 'resource', p_res, r.group_id, jsonb_build_object('profile', p_profile, 'group', p_group, 'level', p_level));
end $$;

create or replace function app.revoke_resource_grant(p_grant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gr public.resource_grants;
begin
  select * into gr from public.resource_grants where id = p_grant;
  if not found then raise exception 'not_found'; end if;
  if app.resource_level(gr.resource_id) < 4 and gr.profile_id is distinct from app.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.resource_grants where id = p_grant;
  perform app.audit('resource_revoke', 'resource', gr.resource_id, null, jsonb_build_object('profile', gr.profile_id, 'group', gr.group_id));
end $$;

-- ───────────────────────── versions, suggestions, comments, lock ─────────────────────────
create table public.resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  version_no int not null,
  title text not null,
  description text,
  body_md text,
  editor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (resource_id, version_no)
);
alter table public.resource_versions enable row level security;
create policy editors on public.resource_versions for select to authenticated using (app.resource_level(resource_id) >= 3);
grant select on public.resource_versions to authenticated;

create table public.resource_suggestions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  base_version int not null,
  title text not null,
  description text,
  body_md text,
  note text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.resource_suggestions enable row level security;
create policy involved on public.resource_suggestions for select to authenticated using (author_id = app.uid() or app.can_approve_resource(resource_id));
grant select on public.resource_suggestions to authenticated;

create table public.resource_comments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.resource_comments (resource_id, created_at);
alter table public.resource_comments enable row level security;
create policy read on public.resource_comments for select using (app.resource_level(resource_id) >= 1);
grant select on public.resource_comments to anon, authenticated;

create table public.resource_locks (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.resource_locks enable row level security;

-- Every note starts with a first version.
create or replace function app.trg_resource_first_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origin = 'note' then
    insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
    values (new.id, 1, new.title, new.description, new.body_md, new.owner_id, 'created');
  end if;
  return null;
end $$;
create trigger first_version after insert on public.resources for each row execute function app.trg_resource_first_version();
insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
  select id, 1, title, description, body_md, owner_id, 'created' from public.resources where origin = 'note';

create or replace function app.resource_lock_status(p_res uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('holder', p.display_name, 'mine', l.profile_id = app.uid(), 'until', l.expires_at)
                     from public.resource_locks l join public.profiles p on p.id = l.profile_id
                    where l.resource_id = p_res and l.expires_at > now() and app.resource_level(p_res) >= 1), 'null'::jsonb)
$$;

create or replace function app.lock_resource(p_res uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); l public.resource_locks;
begin
  if app.resource_level(p_res) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.resource_locks where resource_id = p_res for update;
  if found and l.profile_id <> me and l.expires_at > now() then raise exception 'locked'; end if;
  insert into public.resource_locks (resource_id, profile_id, expires_at) values (p_res, me, now() + make_interval(mins => app.param('lock_minutes')))
  on conflict (resource_id) do update set profile_id = me, expires_at = excluded.expires_at;
  return app.resource_lock_status(p_res);
end $$;

create or replace function app.release_resource(p_res uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.resource_locks where resource_id = p_res and profile_id = app.uid()
$$;

-- Notes: the author and everybody with the right to edit; every save is a new version.
create or replace function app.save_note(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        body text := coalesce(p ->> 'body', ''); r public.resources; l public.resource_locks; v int; vis text := nullif(p ->> 'visibility', '');
        lic text := nullif(p ->> 'license', '');
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  if char_length(body) < 1 or char_length(body) > 100000 then raise exception 'invalid' using errcode = '23514'; end if;
  if rid is null then
    perform app.require_action('share');
    if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
    if vis is not null and vis not in ('me', 'invited', 'group', 'link', 'public') then raise exception 'invalid' using errcode = '23514'; end if;
    if vis = 'group' and gid is null then raise exception 'invalid' using errcode = '23514'; end if;
    insert into public.resources (owner_id, group_id, url, host, provider, kind, origin, title, description, body_md, preview, safety, region_id, visibility, license)
    values (me, gid, null, 'hivevoice', 'note', 'note', 'note', left(trim(p ->> 'title'), 200),
            nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), body, '{}'::jsonb, 'trusted',
            coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)), vis, lic)
    returning id into rid;
  else
    select * into r from public.resources where id = rid and origin = 'note' for update;
    if not found or app.resource_level(rid) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
    select * into l from public.resource_locks where resource_id = rid;
    if found and l.profile_id <> me and l.expires_at > now() then raise exception 'locked'; end if;
    update public.resources set title = left(trim(p ->> 'title'), 200), body_md = body,
           description = nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), updated_at = now(), version_no = version_no + 1
     where id = rid returning version_no into v;
    insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
    values (rid, v, left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), body, me, nullif(left(trim(coalesce(p ->> 'note', '')), 300), ''));
    delete from public.resource_tags where resource_id = rid;
    delete from public.resource_locks where resource_id = rid and profile_id = me;
  end if;
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;

-- Back to an earlier version: it becomes the newest one, so nothing is lost.
create or replace function app.restore_resource_version(p_res uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); old public.resource_versions; v int;
begin
  if app.resource_level(p_res) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into old from public.resource_versions where resource_id = p_res and version_no = p_version;
  if not found then raise exception 'not_found'; end if;
  update public.resources set title = old.title, description = old.description, body_md = old.body_md, updated_at = now(), version_no = version_no + 1
   where id = p_res and origin = 'note' returning version_no into v;
  if v is null then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
  values (p_res, v, old.title, old.description, old.body_md, me, 'restored:' || p_version);
end $$;

create or replace function app.suggest_change(p_res uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('resource_suggest'); r public.resources; sid uuid; note text := trim(coalesce(p ->> 'note', ''));
begin
  select * into r from public.resources where id = p_res and origin = 'note';
  if not found or app.resource_level(p_res) < 2 then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(note) < 5 then raise exception 'note_required'; end if;
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 or char_length(coalesce(p ->> 'body', '')) < 1 or char_length(p ->> 'body') > 100000 then
    raise exception 'invalid' using errcode = '23514';
  end if;
  insert into public.resource_suggestions (resource_id, author_id, base_version, title, description, body_md, note)
  values (p_res, me, r.version_no, left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), p ->> 'body', left(note, 500))
  returning id into sid;
  perform app.notify(x.profile_id, 'resource_suggestion', jsonb_build_object('resource_id', r.id, 'title', r.title,
    'by', (select display_name from public.profiles where id = me)))
    from (select r.owner_id as profile_id
          union select m.profile_id from public.group_members m
                where m.group_id = r.group_id and m.role in ('admin', 'maintainer')) x where x.profile_id <> me;
  return sid;
end $$;

create or replace function app.decide_suggestion(p_suggestion uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); s public.resource_suggestions; r public.resources; v int;
begin
  select * into s from public.resource_suggestions where id = p_suggestion and status = 'open' for update;
  if not found then raise exception 'not_found'; end if;
  if not app.can_approve_resource(s.resource_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.resources where id = s.resource_id for update;
  if p_accept then
    if r.version_no <> s.base_version then raise exception 'outdated'; end if;
    update public.resources set title = s.title, description = s.description, body_md = s.body_md, updated_at = now(), version_no = version_no + 1
     where id = r.id returning version_no into v;
    insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
    values (r.id, v, s.title, s.description, s.body_md, s.author_id, 'suggestion: ' || s.note);
  end if;
  update public.resource_suggestions set status = case when p_accept then 'accepted' else 'rejected' end, decided_by = me, decided_at = now() where id = p_suggestion;
  perform app.notify(s.author_id, 'resource_suggestion_decided', jsonb_build_object('resource_id', r.id, 'title', r.title, 'accepted', p_accept));
end $$;

create or replace function app.comment_resource(p_res uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('resource_comment'); cid uuid;
begin
  if app.resource_level(p_res) < 2 then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p_body), '')) < 1 then raise exception 'body_required'; end if;
  insert into public.resource_comments (resource_id, author_id, body) values (p_res, me, left(trim(p_body), 2000)) returning id into cid;
  return cid;
end $$;

create or replace function app.delete_resource_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.resource_comments;
begin
  select * into c from public.resource_comments where id = p_comment;
  if not found then return; end if;
  if c.author_id <> app.uid() and app.resource_level(c.resource_id) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.resource_comments where id = p_comment;
end $$;

-- ───────────────────────── copies ─────────────────────────
-- Copies are allowed when the licence says so (CC) or the document may be downloaded; the copy points to the original.
create or replace function app.copy_resource(p_res uuid, p_group uuid, p_file jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('share'); r public.resources; rid uuid; lvl int := app.resource_level(p_res);
begin
  select * into r from public.resources where id = p_res;
  if not found or lvl < 1 then raise exception 'not_found'; end if;
  if not (lvl >= 3 or r.license in ('cc_by', 'cc_by_sa', 'cc0') or (r.allow_download and r.license is distinct from 'all_rights') or r.origin = 'link') then
    raise exception 'copy_not_allowed' using errcode = '42501';
  end if;
  if p_group is not null and not app.has_group_permission(p_group, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.origin = 'file' and (p_file is null or jsonb_typeof(p_file) <> 'object') then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.resources (owner_id, group_id, url, host, provider, kind, origin, title, description, body_md, preview, safety, safety_notes, region_id,
                                visibility, license, copied_from)
  values (me, p_group, r.url, r.host, r.provider, r.kind, r.origin, r.title, r.description, r.body_md, r.preview, r.safety, r.safety_notes, r.region_id,
          case when p_group is not null then 'group' else 'me' end, case when r.license in ('cc_by', 'cc_by_sa', 'cc0') then r.license else null end, r.id)
  returning id into rid;
  if r.origin = 'file' then perform app.add_extras('resource', rid, jsonb_build_array(p_file), null); end if;
  insert into public.resource_tags (resource_id, tag_id) select rid, tag_id from public.resource_tags where resource_id = p_res on conflict do nothing;
  return rid;
end $$;

-- ───────────────────────── ownership, trash ─────────────────────────
create table public.resource_transfers (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index on public.resource_transfers (resource_id) where status = 'proposed';
alter table public.resource_transfers enable row level security;
create policy involved on public.resource_transfers for select to authenticated using (from_id = app.uid() or to_id = app.uid());
grant select on public.resource_transfers to authenticated;

create or replace function app.propose_resource_transfer(p_res uuid, p_to uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.resources; tid uuid;
begin
  select * into r from public.resources where id = p_res and owner_id = me;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_to = me or not app.profile_is_verified(p_to) or app.contact_block_reason(me, p_to) is not null then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.resource_transfers (resource_id, from_id, to_id) values (p_res, me, p_to) returning id into tid;
  perform app.notify(p_to, 'resource_transfer', jsonb_build_object('transfer_id', tid, 'title', r.title, 'by', (select display_name from public.profiles where id = me)));
  return tid;
end $$;

create or replace function app.decide_resource_transfer(p_transfer uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); t public.resource_transfers; r public.resources;
begin
  select * into t from public.resource_transfers where id = p_transfer and to_id = me and status = 'proposed' for update;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.resources where id = t.resource_id;
  if p_accept and r.owner_id = t.from_id then
    update public.resources set owner_id = me where id = r.id;
    update public.attachments set owner_id = me where resource_id = r.id;
    delete from public.resource_grants where resource_id = r.id and profile_id = me;
    perform app.audit('resource_transfer', 'resource', r.id, r.group_id, jsonb_build_object('from', t.from_id, 'to', me));
  end if;
  update public.resource_transfers set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = t.id;
  perform app.notify(t.from_id, 'resource_transfer_answer', jsonb_build_object('title', r.title, 'accepted', p_accept,
    'name', (select display_name from public.profiles where id = me)));
end $$;

create or replace function app.cancel_resource_transfer(p_transfer uuid) returns void
language sql security definer set search_path = '' as $$
  update public.resource_transfers set status = 'cancelled', decided_at = now() where id = p_transfer and from_id = app.uid() and status = 'proposed'
$$;

-- Into a group (the owner must be allowed to post there) or back to oneself.
create or replace function app.move_resource_to_group(p_res uuid, p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.resources;
begin
  select * into r from public.resources where id = p_res and owner_id = me;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_group is not null and not app.has_group_permission(p_group, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.resources set group_id = p_group,
         visibility = case when p_group is not null and visibility = 'public' then 'group' when p_group is null and visibility = 'group' then 'me' else visibility end,
         edit_mode = case when p_group is null and edit_mode = 'group' then 'me' else edit_mode end
   where id = p_res;
  perform app.audit('resource_move', 'resource', p_res, p_group, '{}'::jsonb);
end $$;

create or replace function app.trash_resource(p_res uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_verified();
  if app.resource_level(p_res) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.resources set trashed_at = now() where id = p_res and trashed_at is null;
  delete from public.resource_locks where resource_id = p_res;
  perform app.audit('resource_trashed', 'resource', p_res, null, '{}'::jsonb);
end $$;

create or replace function app.restore_resource(p_res uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_verified();
  if app.resource_level(p_res) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.resources set trashed_at = null where id = p_res;
end $$;

-- ───────────────────────── storage quota ─────────────────────────
create or replace function app.trg_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare used bigint; lim bigint; gid uuid;
begin
  select group_id into gid from public.resources where id = new.resource_id;
  if gid is not null then
    select coalesce(sum(a.size_bytes), 0) into used from public.attachments a join public.resources r on r.id = a.resource_id where r.group_id = gid;
    lim := app.param('quota_group_mb')::bigint * 1048576;
  else
    select coalesce(sum(a.size_bytes), 0) into used from public.attachments a
     where a.owner_id = new.owner_id and (a.resource_id is null or not exists (select 1 from public.resources r where r.id = a.resource_id and r.group_id is not null));
    lim := app.param(case when app.trust_level(new.owner_id) >= 2 then 'quota_l2_mb' else 'quota_l1_mb' end)::bigint * 1048576;
  end if;
  if used + new.size_bytes > lim then raise exception 'quota_exceeded' using errcode = '53400'; end if;
  return new;
end $$;
create trigger quota before insert on public.attachments for each row execute function app.trg_quota();

create or replace function app.storage_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', coalesce((select sum(a.size_bytes) from public.attachments a
                       where a.owner_id = app.uid() and (a.resource_id is null or not exists (select 1 from public.resources r where r.id = a.resource_id and r.group_id is not null))), 0),
    'limit', app.param(case when app.trust_level(app.uid()) >= 2 then 'quota_l2_mb' else 'quota_l1_mb' end)::bigint * 1048576)
$$;

-- ───────────────────────── account deletion: the group keeps the documents, or they go ─────────────────────────
create or replace function app.delete_account(p_profile uuid, p_keep_group_items boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare auth_id uuid; gone constant uuid := '00000000-0000-0000-0000-00000000dead';
begin
  if p_profile = gone then return; end if;
  select auth_user_id into auth_id from public.profiles where id = p_profile;
  delete from public.groups g where g.created_by = p_profile
    and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id <> p_profile);
  delete from public.resources where owner_id = p_profile and group_id is null;
  if p_keep_group_items then
    update public.resources r set owner_id = coalesce((select g.owner_id from public.groups g where g.id = r.group_id and g.owner_id <> p_profile), gone) where r.owner_id = p_profile;
  else
    delete from public.resources where owner_id = p_profile;
  end if;
  delete from public.listings where owner_id = p_profile;
  update public.posts set author_id = gone where author_id = p_profile;
  update public.messages set sender_id = gone where sender_id = p_profile;
  update public.arguments set author_id = gone where author_id = p_profile;
  update public.argument_replies set author_id = gone where author_id = p_profile;
  update public.attachments set owner_id = gone where owner_id = p_profile;
  delete from public.profiles where id = p_profile;
  if auth_id is not null then delete from auth.users where id = auth_id; end if;
end $$;

create or replace function app.delete_account(p_profile uuid) returns void
language sql security definer set search_path = '' as $$ select app.delete_account(p_profile, true) $$;
revoke execute on function app.delete_account(uuid, boolean) from public;
grant execute on function app.delete_account(uuid, boolean) to hivevoice_server;

-- ───────────────────────── the clock ─────────────────────────
create or replace function app.documents_tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.resources where trashed_at is not null and trashed_at < now() - make_interval(days => app.param('trash_days'));
  delete from public.resource_locks where expires_at < now();
  update public.resource_transfers set status = 'cancelled', decided_at = now()
   where status = 'proposed' and created_at < now() - make_interval(days => app.param('doc_transfer_days'));
  delete from public.resource_grants where expires_at is not null and expires_at < now() - interval '30 days';
end $$;

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
  perform app.expire_author_invites();
  perform app.responsibility_tick();
  perform app.dispute_tick();
  perform app.documents_tick();
  return n;
end $$;

grant execute on function app.resource_level(uuid, uuid), app.attachment_download_allowed(uuid), app.can_approve_resource(uuid), app.resource_lock_status(uuid)
  to anon, authenticated, hivevoice_server;
grant execute on function app.set_resource_access(uuid, text, text, boolean, text), app.renew_resource_link(uuid), app.grant_resource(uuid, uuid, uuid, text, timestamptz),
  app.revoke_resource_grant(uuid), app.lock_resource(uuid), app.release_resource(uuid), app.save_note(jsonb), app.restore_resource_version(uuid, int),
  app.suggest_change(uuid, jsonb), app.decide_suggestion(uuid, boolean), app.comment_resource(uuid, text), app.delete_resource_comment(uuid),
  app.copy_resource(uuid, uuid, jsonb), app.propose_resource_transfer(uuid, uuid), app.decide_resource_transfer(uuid, boolean),
  app.cancel_resource_transfer(uuid), app.move_resource_to_group(uuid, uuid), app.trash_resource(uuid), app.restore_resource(uuid), app.storage_usage()
  to authenticated, hivevoice_server;
