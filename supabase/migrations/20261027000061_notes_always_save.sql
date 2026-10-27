-- Notes keep themselves: a note exists as soon as there is something to keep. A private note needs no text yet and does
-- not count as "sharing" (only notes made for a group, a link or everybody use up the daily share limit); a day's worth
-- of private notes is capped instead. Without a visibility a new note is private (it used to be public by the table default).

create or replace function app.save_note(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        body text := coalesce(p ->> 'body', ''); r public.resources; l public.resource_locks; vis text := coalesce(nullif(p ->> 'visibility', ''), 'me');
        lic text := nullif(p ->> 'license', '');
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  if char_length(body) > 100000 then raise exception 'invalid' using errcode = '23514'; end if;
  if rid is null then
    if gid is not null or vis <> 'me' then perform app.require_action('share'); end if;
    if (select count(*) from public.resources where owner_id = me and origin = 'note' and created_at > now() - interval '1 day') >= 200 then raise exception 'rate_limited'; end if;
    if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
    if vis not in ('me', 'invited', 'group', 'link', 'public') then raise exception 'invalid' using errcode = '23514'; end if;
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
