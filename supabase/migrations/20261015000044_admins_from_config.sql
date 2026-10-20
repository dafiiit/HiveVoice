-- Server admins come from the operator's configuration (ADMIN_EMAILS at the hosting provider), not
-- from the app. The server calls app.sync_server_admins with that list; only confirmed email
-- addresses count. Nobody can become admin by a button, and admins cannot appoint each other.

create or replace function app.sync_server_admins(p_emails text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare wanted uuid[]; added uuid[]; removed uuid[];
begin
  select coalesce(array_agg(p.id), '{}') into wanted
    from public.profiles p join auth.users u on u.id = p.auth_user_id
    where u.email_confirmed_at is not null and u.deleted_at is null
      and lower(u.email) = any (select lower(trim(e)) from unnest(coalesce(p_emails, '{}')) e where trim(e) <> '');
  with d as (delete from public.server_admins where profile_id <> all (wanted) returning profile_id)
    select coalesce(array_agg(profile_id), '{}') into removed from d;
  with i as (insert into public.server_admins (profile_id) select unnest(wanted) on conflict do nothing returning profile_id)
    select coalesce(array_agg(profile_id), '{}') into added from i;
  if cardinality(added) > 0 or cardinality(removed) > 0 then
    perform app.audit('admins_synced', 'admin', null, null, jsonb_build_object('added', added, 'removed', removed));
  end if;
  return jsonb_build_object('added', added, 'removed', removed, 'admins', cardinality(wanted));
end $$;

revoke execute on function app.sync_server_admins(text[]) from public;
grant execute on function app.sync_server_admins(text[]) to hivevoice_server;
-- The old way in (first visitor claims admin) is gone.
revoke execute on function app.admin_grant(uuid, boolean) from hivevoice_server;

-- Same as before, but appointing or removing admins is no longer an admin action.
create or replace function app.admin_action(p_kind text, p_subject uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('admin'); pid uuid;
begin
  if p_kind in ('grant_admin', 'revoke_admin') then raise exception 'admins_from_config' using errcode = '42501'; end if;
  if p_kind not in ('ban', 'unban', 'block_initiative', 'unblock_initiative', 'chat_access') then raise exception 'invalid' using errcode = '23514'; end if;
  if p_kind in ('ban', 'block_initiative', 'chat_access') and char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'reason_required'; end if;
  if p_kind = 'chat_access' and char_length(trim(p_reason)) < 20 then raise exception 'reason_required'; end if;
  if (select count(*) from public.server_admins) < 2 then
    perform app.execute_admin_action(p_kind, p_subject, trim(coalesce(p_reason, '')), me);
    return 'done';
  end if;
  insert into public.admin_proposals (kind, subject_id, reason, proposed_by) values (p_kind, p_subject, trim(coalesce(p_reason, '')), me) returning id into pid;
  perform app.notify(a.profile_id, 'admin_proposal', jsonb_build_object('proposal_id', pid, 'kind', p_kind)) from public.server_admins a where a.profile_id <> me;
  return 'pending';
end $$;

-- Proposals to change admins that were still open can no longer be carried out.
update public.admin_proposals set status = 'rejected', decided_at = now()
  where status = 'pending' and kind in ('grant_admin', 'revoke_admin');
