-- Rights, stage 9: polls in everyday talk, and one place that answers "may I?" for every kind of object.
--   polls get a deadline (24 hours, 7 days), the creator and the group's admins and maintainers can end or delete them,
--   and app.can(action, object) says yes or no with a reason for every row of the rights matrix.

-- ───────────────────────── polls ─────────────────────────
-- The creator of the message or post, and for a post in a group its admins and maintainers.
create or replace function app.can_manage_poll(p_poll uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.polls pl
    left join public.messages m on m.id = pl.message_id
    left join public.posts p on p.id = pl.post_id
    where pl.id = p_poll and app.uid() is not null and (
      m.sender_id = app.uid() or p.author_id = app.uid()
      or (p.group_id is not null and exists (select 1 from public.group_members gm where gm.group_id = p.group_id and gm.profile_id = app.uid() and gm.role in ('admin', 'maintainer')))))
$$;

create or replace function app.close_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_poll(p_poll) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.polls set closes_at = now() where id = p_poll and (closes_at is null or closes_at > now());
end $$;

create or replace function app.delete_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_poll(p_poll) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.polls where id = p_poll;
end $$;

create or replace function app.add_extras(p_kind text, p_parent uuid, p_files jsonb, p_poll jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.uid(); my_auth text; f jsonb; sz int; mt text; found_obj boolean; n int := 0; i int := 0; opt text; pid uuid;
  allowed text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/markdown', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation'];
  mid uuid; pst uuid; rsc uuid; max_files int := case when p_kind = 'resource' then 1 else 6 end;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select auth_user_id::text into my_auth from public.profiles where id = me;
  if p_kind = 'message' then
    if not exists (select 1 from public.messages where id = p_parent and sender_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    mid := p_parent;
  elsif p_kind = 'post' then
    if not exists (select 1 from public.posts where id = p_parent and author_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    pst := p_parent;
  elsif p_kind = 'resource' then
    if not exists (select 1 from public.resources where id = p_parent and owner_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    rsc := p_parent;
  else raise exception 'invalid' using errcode = '23514'; end if;

  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    for f in select * from jsonb_array_elements(p_files) loop
      n := n + 1;
      if n > max_files then raise exception 'invalid' using errcode = '23514'; end if;
      if (f ->> 'path') !~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.[a-z0-9]{2,4}$' or split_part(f ->> 'path', '/', 1) <> my_auth then
        raise exception 'invalid' using errcode = '23514';
      end if;
      sz := coalesce((f ->> 'size')::int, 0);
      mt := f ->> 'mime';
      if to_regclass('storage.objects') is not null then
        -- Trust what the store recorded, not what the browser claimed.
        execute 'select true, coalesce((metadata ->> ''size'')::int, 0), metadata ->> ''mimetype'' from storage.objects where bucket_id = ''files'' and name = $1'
          into found_obj, sz, mt using f ->> 'path';
        if not coalesce(found_obj, false) then raise exception 'invalid' using errcode = '23514'; end if;
      end if;
      if mt is null or not (mt = any (allowed)) or sz < 1 or sz > 10485760 then raise exception 'invalid' using errcode = '23514'; end if;
      insert into public.attachments (owner_id, message_id, post_id, resource_id, path, name, mime, size_bytes)
      values (me, mid, pst, rsc, f ->> 'path', regexp_replace(left(btrim(coalesce(f ->> 'name', 'Datei')), 160), '[\\/]', '_', 'g'), mt, sz);
    end loop;
  end if;

  if p_poll is not null and jsonb_typeof(p_poll) = 'object' and p_kind in ('message', 'post') then
    if char_length(btrim(coalesce(p_poll ->> 'question', ''))) < 1 then raise exception 'invalid' using errcode = '23514'; end if;
    if jsonb_array_length(coalesce(p_poll -> 'options', '[]'::jsonb)) not between 2 and 8 then raise exception 'invalid' using errcode = '23514'; end if;
    insert into public.polls (message_id, post_id, question, multiple, closes_at)
    values (mid, pst, left(btrim(p_poll ->> 'question'), 200), coalesce((p_poll ->> 'multiple')::boolean, false),
            case when (p_poll ->> 'hours') ~ '^[0-9]{1,3}$' and (p_poll ->> 'hours')::int between 1 and 720 then now() + make_interval(hours => (p_poll ->> 'hours')::int) end)
    returning id into pid;
    for opt in select btrim(jsonb_array_elements_text(p_poll -> 'options')) loop
      if char_length(opt) < 1 then raise exception 'invalid' using errcode = '23514'; end if;
      insert into public.poll_options (poll_id, position, label) values (pid, i, left(opt, 100));
      i := i + 1;
    end loop;
  end if;
end $$;

create or replace function app.poll_view(p_polls uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'message_id', p.message_id, 'post_id', p.post_id, 'question', p.question, 'multiple', p.multiple,
      'closed', p.closes_at is not null and p.closes_at <= now(), 'closes_at', p.closes_at, 'can_manage', app.can_manage_poll(p.id),
      'voters', (select count(distinct v.profile_id) from public.poll_votes v where v.poll_id = p.id),
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                    'votes', (select count(*) from public.poll_votes v where v.option_id = o.id),
                    'mine', exists (select 1 from public.poll_votes v where v.option_id = o.id and v.profile_id = app.uid())) order by o.position)
                  from public.poll_options o where o.poll_id = p.id)
    ) order by p.created_at), '[]'::jsonb)
  from public.polls p where p.id = any (p_polls) and app.can_read_attachment(p.message_id, p.post_id, null)
$$;

grant execute on function app.can_manage_poll(uuid) to anon, authenticated, hivevoice_server;
grant execute on function app.close_poll(uuid), app.delete_poll(uuid) to authenticated, hivevoice_server;
grant execute on function app.poll_view(uuid[]) to anon, authenticated, hivevoice_server;
grant execute on function app.add_extras(text, uuid, jsonb, jsonb) to authenticated, hivevoice_server;

-- ───────────────────────── the rights matrix ─────────────────────────
-- Every row has a rule here (app.can) and a sentence for people on the rights page (messages rights.matrix.*).
create table public.rights_matrix (
  action text primary key,
  resource text not null,
  position int not null
);
alter table public.rights_matrix enable row level security;
create policy read_all on public.rights_matrix for select using (true);
grant select on public.rights_matrix to anon, authenticated;
insert into public.rights_matrix (action, resource, position) values
  ('resource.view', 'resource', 1), ('resource.comment', 'resource', 2), ('resource.edit', 'resource', 3), ('resource.manage', 'resource', 4),
  ('resource.download', 'resource', 5), ('resource.copy', 'resource', 6),
  ('initiative.support', 'initiative', 1), ('initiative.edit', 'initiative', 2), ('initiative.invite_author', 'initiative', 3),
  ('initiative.start_ballot', 'initiative', 4), ('initiative.withdraw', 'initiative', 5), ('initiative.delete', 'initiative', 6),
  ('group.post', 'group', 1), ('group.invite', 'group', 2), ('group.manage_members', 'group', 3), ('group.archive', 'group', 4),
  ('group.transfer', 'group', 5), ('group.delete', 'group', 6),
  ('responsibility.confirm', 'responsibility', 1), ('responsibility.dispute', 'responsibility', 2), ('responsibility.answer', 'responsibility', 3),
  ('responsibility.edit', 'responsibility', 4),
  ('poll.manage', 'poll', 1), ('message.edit', 'message', 1), ('message.delete', 'message', 2), ('report.appeal', 'report', 1);

-- May the signed-in person do this to this object? { allowed, reason }. The reasons are the same codes the rights page explains.
create or replace function app.can(p_action text, p_object uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := app.uid(); ok boolean := false; why text := null; lvl int; r public.resources; i public.initiatives; g public.groups; s public.responsibilities;
  m public.messages; verified boolean;
begin
  verified := me is not null and app.profile_is_verified(me);
  if me is null and p_action <> 'resource.view' then return jsonb_build_object('allowed', false, 'reason', 'not_authenticated'); end if;
  case p_action
    when 'resource.view' then
      lvl := app.resource_level(p_object); ok := lvl >= 1; why := case when ok then null else 'not_shared' end;
    when 'resource.comment' then
      lvl := app.resource_level(p_object); ok := lvl >= 2 and verified;
      why := case when ok then null when lvl < 1 then 'not_shared' when lvl < 2 then 'view_only' else 'level_required' end;
    when 'resource.edit' then
      lvl := app.resource_level(p_object); ok := lvl >= 3 and verified;
      why := case when ok then null when lvl < 1 then 'not_shared' when lvl = 1 then 'view_only' when lvl = 2 then 'suggest_only' else 'level_required' end;
    when 'resource.manage' then
      lvl := app.resource_level(p_object); ok := lvl >= 4 and verified;
      why := case when ok then null when lvl < 1 then 'not_shared' else 'not_owner' end;
    when 'resource.download' then
      select * into r from public.resources where id = p_object;
      lvl := app.resource_level(p_object); ok := found and lvl >= 1 and (r.allow_download or lvl >= 3);
      why := case when ok then null when lvl < 1 then 'not_shared' else 'download_off' end;
    when 'resource.copy' then
      select * into r from public.resources where id = p_object;
      lvl := app.resource_level(p_object);
      ok := found and lvl >= 1 and verified and (lvl >= 3 or r.license in ('cc_by', 'cc_by_sa', 'cc0') or (r.allow_download and r.license is distinct from 'all_rights') or r.origin = 'link');
      why := case when ok then null when lvl < 1 then 'not_shared' when not verified then 'level_required' else 'copy_not_allowed' end;
    when 'initiative.support' then
      select * into i from public.initiatives where id = p_object;
      ok := found and verified and i.outcome is null and i.blocked_at is null and i.phase in ('idea', 'debate');
      why := case when ok then null when not found then 'not_found' when not verified then 'level_required' when i.blocked_at is not null or i.outcome is not null then 'closed' else 'wrong_phase' end;
    when 'initiative.edit' then
      select * into i from public.initiatives where id = p_object;
      ok := found and verified and app.can_edit_initiative(p_object, me) and i.outcome is null and i.blocked_at is null;
      why := case when ok then null when not found then 'not_found' when not app.can_edit_initiative(p_object, me) then 'not_author' when not verified then 'level_required' else 'closed' end;
    when 'initiative.invite_author' then
      select * into i from public.initiatives where id = p_object;
      ok := found and verified and app.is_initiative_author(p_object, me) and i.outcome is null and i.blocked_at is null
            and (select count(*) from public.initiative_authors where initiative_id = p_object) + (select count(*) from public.initiative_author_invites where initiative_id = p_object and status = 'pending') < app.param('authors_max');
      why := case when ok then null when not found then 'not_found' when not app.is_initiative_author(p_object, me) then 'not_author' when not verified then 'level_required'
                  when i.outcome is not null or i.blocked_at is not null then 'closed' else 'too_many_authors' end;
    when 'initiative.start_ballot' then
      select * into i from public.initiatives where id = p_object;
      ok := found and verified and app.can_edit_initiative(p_object, me) and i.phase = 'debate' and i.outcome is null and i.blocked_at is null
            and not exists (select 1 from public.ballots where initiative_id = p_object and status = 'open')
            and i.published_at is not null and i.published_at <= now() - make_interval(days => app.param('debate_min_days'))
            and i.support_count >= app.support_threshold(i.region_id);
      why := case when ok then null when not found then 'not_found' when not app.can_edit_initiative(p_object, me) then 'not_author' when not verified then 'level_required'
                  when i.outcome is not null or i.blocked_at is not null then 'closed' when i.phase <> 'debate' then 'wrong_phase'
                  when exists (select 1 from public.ballots where initiative_id = p_object and status = 'open') then 'ballot_running'
                  when i.published_at is null or i.published_at > now() - make_interval(days => app.param('debate_min_days')) then 'debate_too_short' else 'not_enough_support' end;
    when 'initiative.withdraw' then
      select * into i from public.initiatives where id = p_object;
      ok := found and verified and i.lead_id = me and i.outcome is null;
      why := case when ok then null when not found then 'not_found' when i.lead_id is distinct from me then 'not_lead' when not verified then 'level_required' else 'closed' end;
    when 'initiative.delete' then
      select * into i from public.initiatives where id = p_object;
      ok := found and i.lead_id = me
            and not (exists (select 1 from public.initiative_supports sp where sp.initiative_id = p_object and not app.is_initiative_author(p_object, sp.profile_id))
                  or exists (select 1 from public.ballots where initiative_id = p_object)
                  or exists (select 1 from public.arguments a where a.initiative_id = p_object and not app.is_initiative_author(p_object, a.author_id))
                  or exists (select 1 from public.posts x where x.initiative_id = p_object and not app.is_initiative_author(p_object, x.author_id)));
      why := case when ok then null when not found then 'not_found' when i.lead_id is distinct from me then 'not_lead' else 'has_activity' end;
    when 'group.post' then
      ok := verified and app.has_group_permission(p_object, 'post');
      why := case when ok then null when not verified then 'level_required' when app.group_role(p_object) is null then 'not_member' else 'not_allowed' end;
    when 'group.invite' then
      ok := verified and app.may_invite(p_object, 'contributor');
      why := case when ok then null when not verified then 'level_required' when app.group_role(p_object) is null then 'not_member' else 'not_allowed' end;
    when 'group.manage_members' then
      ok := verified and app.has_group_permission(p_object, 'manage_members');
      why := case when ok then null when not verified then 'level_required' when app.group_role(p_object) is null then 'not_member' else 'not_allowed' end;
    when 'group.archive' then
      ok := verified and app.group_role(p_object) = 'admin';
      why := case when ok then null when not verified then 'level_required' when app.group_role(p_object) is null then 'not_member' else 'not_admin' end;
    when 'group.transfer', 'group.delete' then
      select * into g from public.groups where id = p_object;
      ok := found and verified and g.owner_id = me;
      why := case when ok then null when not found then 'not_found' when not verified then 'level_required' else 'not_owner' end;
    when 'responsibility.confirm' then
      select * into s from public.responsibilities where id = p_object;
      ok := found and s.state = 'active' and verified and not app.is_resp_holder(p_object, me)
            and s.region_id is not null and exists (select 1 from public.user_regions where profile_id = me and region_id = s.region_id);
      why := case when ok then null when not found or s.state <> 'active' then 'not_found' when not verified then 'level_required' when app.is_resp_holder(p_object, me) then 'own_responsibility' else 'not_affected' end;
    when 'responsibility.dispute' then
      select * into s from public.responsibilities where id = p_object;
      ok := found and s.state = 'active' and verified and not s.is_official and not app.is_resp_holder(p_object, me)
            and not exists (select 1 from public.responsibility_disputes where responsibility_id = p_object and status in ('evidence', 'jury'));
      why := case when ok then null when not found or s.state <> 'active' then 'not_found' when not verified then 'level_required' when s.is_official then 'official_role'
                  when app.is_resp_holder(p_object, me) then 'own_responsibility' else 'duplicate' end;
    when 'responsibility.answer' then
      ok := verified and app.is_resp_holder(p_object, me);
      why := case when ok then null when not verified then 'level_required' else 'not_holder' end;
    when 'responsibility.edit' then
      select * into s from public.responsibilities where id = p_object;
      ok := found and verified and s.holder_id = me;
      why := case when ok then null when not found then 'not_found' when not verified then 'level_required' else 'not_holder' end;
    when 'poll.manage' then
      ok := app.can_manage_poll(p_object); why := case when ok then null else 'not_creator' end;
    when 'message.edit' then
      select * into m from public.messages where id = p_object;
      ok := found and m.sender_id = me and m.created_at > now() - interval '15 minutes';
      why := case when ok then null when not found then 'not_found' when m.sender_id is distinct from me then 'not_author' else 'edit_window_over' end;
    when 'message.delete' then
      select * into m from public.messages where id = p_object;
      ok := found and m.sender_id = me;
      why := case when ok then null when not found then 'not_found' else 'not_author' end;
    when 'report.appeal' then
      ok := app.can_appeal(p_object); why := case when ok then null else 'not_allowed' end;
    else return jsonb_build_object('allowed', false, 'reason', 'unknown_action');
  end case;
  return jsonb_build_object('allowed', coalesce(ok, false), 'reason', case when coalesce(ok, false) then null else coalesce(why, 'not_allowed') end);
end $$;
grant execute on function app.can(text, uuid) to anon, authenticated, hivevoice_server;
