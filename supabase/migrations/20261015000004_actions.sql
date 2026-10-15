-- Additional user actions.

update public.regions set name = 'Hamburg' where name like 'Hamburg, Freie und Hansestadt%';

create or replace function app.create_request(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid;
begin
  if char_length(coalesce(trim(p ->> 'body'), '')) < 10 then raise exception 'body_required'; end if;
  if not exists (select 1 from public.responsibilities where id = (p ->> 'responsibility_id')::uuid) then raise exception 'not_found'; end if;
  if exists (select 1 from public.responsibilities where id = (p ->> 'responsibility_id')::uuid and holder_id = me) then
    raise exception 'own_responsibility';
  end if;
  insert into public.responsibility_requests (responsibility_id, initiative_id, group_id, listing_id, author_id, body)
  values ((p ->> 'responsibility_id')::uuid, nullif(p ->> 'initiative_id', '')::uuid, nullif(p ->> 'group_id', '')::uuid,
          nullif(p ->> 'listing_id', '')::uuid, me, trim(p ->> 'body'))
  returning id into rid;
  return rid;
end $$;

-- The authors of an initiative form a working group for its implementation.
create or replace function app.form_working_group(p_initiative uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); i public.initiatives; gid uuid; s text;
begin
  select * into i from public.initiatives where id = p_initiative;
  if not exists (select 1 from public.initiative_authors where initiative_id = p_initiative and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if i.group_id is not null then
    return (select slug from public.groups where id = i.group_id);
  end if;
  gid := app.create_group(jsonb_build_object('name', i.title, 'summary', i.summary, 'kind', 'initiative',
                                             'join_policy', 'open', 'region_id', i.region_id));
  insert into public.group_members (group_id, profile_id, role)
    select gid, a.profile_id, 'admin' from public.initiative_authors a where a.initiative_id = p_initiative
    on conflict do nothing;
  update public.initiatives set group_id = gid where id = p_initiative;
  perform app.notify(s2.profile_id, 'working_group', jsonb_build_object('initiative_id', i.id, 'title', i.title,
                     'slug', (select slug from public.groups where id = gid)))
    from public.initiative_supports s2 where s2.initiative_id = p_initiative and s2.profile_id <> me;
  select slug into s from public.groups where id = gid;
  return s;
end $$;

create or replace function app.set_initiative_phase(p_initiative uuid, p_phase public.initiative_phase) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); cur public.initiative_phase;
begin
  if not exists (select 1 from public.initiative_authors where initiative_id = p_initiative and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select phase into cur from public.initiatives where id = p_initiative;
  -- Authors may only move forward from implementation to done, or withdraw.
  if not (cur = 'implementation' and p_phase = 'done') then raise exception 'wrong_phase'; end if;
  update public.initiatives set phase = p_phase where id = p_initiative;
end $$;

create or replace function app.withdraw_initiative(p_initiative uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified();
begin
  if not exists (select 1 from public.initiative_authors where initiative_id = p_initiative and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.initiatives set outcome = 'withdrawn' where id = p_initiative and outcome is null;
end $$;

grant execute on function app.create_request(jsonb), app.form_working_group(uuid),
  app.set_initiative_phase(uuid, public.initiative_phase), app.withdraw_initiative(uuid)
  to authenticated, hivevoice_server;
