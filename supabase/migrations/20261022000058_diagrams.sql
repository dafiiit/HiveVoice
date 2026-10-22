-- Diagrams (draw.io) as a third kind of own document next to notes and uploads: same rights, sharing, versions and trash.
-- The body is the SVG that draw.io exports with the diagram inside (format "xmlsvg"): it shows as a picture without
-- draw.io and opens again in the editor. It is only ever shown through <img>, so scripts in it never run.
alter table public.resources drop constraint if exists resources_origin_check;
alter table public.resources add constraint resources_origin_check check (origin in ('link', 'file', 'note', 'diagram'));
alter table public.resources drop constraint if exists resources_kind_check;
alter table public.resources add constraint resources_kind_check
  check (kind in ('document','sheet','slides','form','folder','file','pdf','image','video','code','design','map','dataset','page','note','diagram'));
alter table public.resources drop constraint if exists resources_content;
alter table public.resources add constraint resources_content check (
  (origin = 'link' and url is not null and body_md is null) or
  (origin = 'file' and url is null and body_md is null) or
  (origin in ('note', 'diagram') and url is null and body_md is not null));
-- A drawing is larger than a text: up to 2 MB for diagrams, notes keep their limit.
alter table public.resources drop constraint if exists resources_body_md_check;
alter table public.resources add constraint resources_body_md_check
  check (char_length(body_md) <= case when origin = 'diagram' then 2000000 else 100000 end);

-- Every note and diagram starts with a first version.
create or replace function app.trg_resource_first_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origin in ('note', 'diagram') then
    insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
    values (new.id, 1, new.title, new.description, new.body_md, new.owner_id, 'created');
  end if;
  return null;
end $$;

-- A diagram: new, or a change to one I may edit (a new version each time).
create or replace function app.save_diagram(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid;
        body text := coalesce(p ->> 'svg', ''); l public.resource_locks; v int;
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
    update public.resources set title = left(trim(p ->> 'title'), 200), body_md = body, updated_at = now(), version_no = version_no + 1
     where id = rid returning version_no into v;
    insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
    select rid, v, left(trim(p ->> 'title'), 200), description, body, me, null from public.resources where id = rid;
  end if;
  return rid;
end $$;
grant execute on function app.save_diagram(jsonb) to authenticated, hivevoice_server;

-- Back to an earlier version works for diagrams as for notes.
create or replace function app.restore_resource_version(p_res uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); old public.resource_versions; v int;
begin
  if app.resource_level(p_res) < 3 then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into old from public.resource_versions where resource_id = p_res and version_no = p_version;
  if not found then raise exception 'not_found'; end if;
  update public.resources set title = old.title, description = old.description, body_md = old.body_md, updated_at = now(), version_no = version_no + 1
   where id = p_res and origin in ('note', 'diagram') returning version_no into v;
  if v is null then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.resource_versions (resource_id, version_no, title, description, body_md, editor_id, note)
  values (p_res, v, old.title, old.description, old.body_md, me, 'restored:' || p_version);
end $$;
