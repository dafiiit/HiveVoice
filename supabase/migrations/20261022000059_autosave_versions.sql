-- Notes and diagrams save themselves while one edits. So that not every pause becomes a version, saving again within
-- 30 minutes of one's own latest version updates that version (one version per sitting). A version made by someone else,
-- a restore, an accepted suggestion or one that open suggestions are based on always stays as it is. `autosave`: keep the editing lock (the editor is still open).

create or replace function app.save_version(p_res uuid, p_title text, p_description text, p_body text, p_note text) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); last public.resource_versions; v int;
begin
  select * into last from public.resource_versions where resource_id = p_res order by version_no desc limit 1;
  if found and last.editor_id = me and last.created_at > now() - interval '30 minutes'
     and coalesce(last.note, '') !~ '^(restored:|suggestion: )'
     -- an open suggestion is based on this version: it must stay as it was, so the suggestion is checked against it
     and not exists (select 1 from public.resource_suggestions s where s.resource_id = p_res and s.status = 'open' and s.base_version = last.version_no) then
    update public.resources set title = p_title, description = p_description, body_md = p_body, updated_at = now() where id = p_res;
    update public.resource_versions set title = p_title, description = p_description, body_md = p_body,
           note = coalesce(nullif(p_note, ''), last.note) where id = last.id;
    return last.version_no;
  end if;
  update public.resources set title = p_title, description = p_description, body_md = p_body, updated_at = now(), version_no = version_no + 1
   where id = p_res returning version_no into v;
  insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
  values (p_res, v, p_title, p_description, p_body, me, nullif(p_note, ''));
  return v;
end $$;
revoke execute on function app.save_version(uuid, text, text, text, text) from public;

create or replace function app.save_note(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        body text := coalesce(p ->> 'body', ''); r public.resources; l public.resource_locks; vis text := nullif(p ->> 'visibility', '');
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
    perform app.save_version(rid, left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''), body,
                             left(trim(coalesce(p ->> 'note', '')), 300));
    delete from public.resource_tags where resource_id = rid;
    if coalesce(p ->> 'autosave', '') <> 'true' then delete from public.resource_locks where resource_id = rid and profile_id = me; end if;
  end if;
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;

create or replace function app.save_diagram(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid;
        body text := coalesce(p ->> 'svg', ''); l public.resource_locks;
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  if char_length(body) > 2000000 then raise exception 'too_large' using errcode = '23514'; end if;
  if body !~ '^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]' then raise exception 'invalid' using errcode = '23514'; end if;
  if rid is null then
    perform app.require_action('share');
    if (select count(*) from public.resources where owner_id = me and created_at > now() - interval '1 day') >= 30 then raise exception 'rate_limited'; end if;
    insert into public.resources (owner_id, url, host, provider, kind, origin, title, body_md, preview, safety, region_id, visibility)
    values (me, null, 'hivevoice', 'drawio', 'diagram', 'diagram', left(trim(p ->> 'title'), 200), body, '{}'::jsonb, 'trusted',
            (select home_region_id from public.profiles where id = me), 'me')
    returning id into rid;
  else
    perform 1 from public.resources where id = rid and origin = 'diagram' for update;
    if not found or app.resource_level(rid) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
    select * into l from public.resource_locks where resource_id = rid;
    if found and l.profile_id <> me and l.expires_at > now() then raise exception 'locked'; end if;
    perform app.save_version(rid, left(trim(p ->> 'title'), 200), (select description from public.resources where id = rid), body, '');
  end if;
  return rid;
end $$;
