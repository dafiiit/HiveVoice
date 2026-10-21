-- Tools in a chat: a private chat can switch on the same tools as a group (tasks, documents, goals …).
-- Underneath it is a secret group of exactly the chat's people, tied to the conversation; it is listed with the
-- chats, not with the groups.
alter table public.groups add column if not exists conversation_id uuid unique references public.conversations(id) on delete cascade;

create or replace function app.chat_tools(p_conversation uuid, p_tools text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); gid uuid; s text; names text;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_tools, '{}')) t where t not in ('goals', 'tasks', 'links', 'collection', 'needs')) then
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
grant execute on function app.chat_tools(uuid, text[]) to authenticated, hivevoice_server;
grant select (conversation_id) on public.groups to anon, authenticated;
