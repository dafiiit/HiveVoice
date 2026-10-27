-- A list is a note whose lines are tasks ("- [ ] …", "- [x] …"): one kind of document, two ways to look at it.
-- Every to-do list becomes a note (rights, link key and people it was shared with come along). The old tables stay as a
-- backup and are no longer shown; nothing is dropped. `note_id` says which note a list became.

alter table public.todo_lists add column if not exists note_id uuid references public.resources(id) on delete set null;

create or replace function app.list_to_note(p_list uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.todo_lists; rid uuid; vis text; mode text; body text;
begin
  select * into l from public.todo_lists where id = p_list for update;
  if not found then return null; end if;
  if l.note_id is not null then return l.note_id; end if;
  vis := case l.read_scope when 'public' then 'public' when 'link' then 'link' when 'people' then 'invited' else 'me' end;
  mode := case when l.write_scope in ('public', 'link') then 'suggest' else 'me' end;
  select coalesce(string_agg('- [' || case when i.done_at is not null then 'x' else ' ' end || '] ' || replace(i.title, E'\n', ' '), E'\n' order by i.position, i.created_at), '')
    into body from public.todo_items i where i.list_id = l.id;
  insert into public.resources (owner_id, url, host, provider, kind, origin, title, body_md, preview, safety, region_id, visibility, edit_mode,
                                link_token, license, allow_download, created_at, updated_at, demo)
  values (l.owner_id, null, 'hivevoice', 'note', 'note', 'note',
          left(case when char_length(trim(l.title)) < 3 then 'Liste ' || trim(l.title) else trim(l.title) end, 200), body, '{}'::jsonb, 'trusted',
          (select home_region_id from public.profiles where id = l.owner_id), vis, mode,
          case when vis = 'link' then l.link_token end, case when vis = 'public' then 'all_rights' end, vis in ('public', 'link'),
          l.created_at, l.updated_at, l.demo)
  returning id into rid;
  insert into public.resource_grants (resource_id, profile_id, level, granted_by)
    select rid, g.profile_id, case when g.can_write then 'edit' else 'view' end, l.owner_id
      from public.object_grants g where g.object_type = 'list' and g.object_id = l.id
    on conflict do nothing;
  update public.todo_lists set note_id = rid where id = l.id;
  return rid;
end $$;
revoke execute on function app.list_to_note(uuid) from public;

-- The page of an old list address asks for the note: only the owner's own list is converted (lists made by code that is
-- not deployed yet are caught up this way).
create or replace function app.my_list_note(p_list uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.todo_lists;
begin
  select * into l from public.todo_lists where id = p_list;
  if not found then return null; end if;
  if l.note_id is not null then return l.note_id; end if;
  if l.owner_id is distinct from app.uid() then return null; end if;
  return app.list_to_note(p_list);
end $$;
grant execute on function app.my_list_note(uuid) to authenticated, hivevoice_server;

select app.list_to_note(id) from public.todo_lists where note_id is null;

-- The example list is a note now, and the example note no longer sells itself.
create or replace function app.demo_note_body() returns text language sql immutable as $$
  select E'Das ist eine Beispielnotiz.\n\n- [ ] Aufgaben lassen sich abhaken\n- [ ] **fett**, _kursiv_ und andere Formatierungen gehen auch'
$$;
update public.resources set body_md = app.demo_note_body() where demo and origin = 'note' and title = 'Erste Notiz (Beispiel)';

create or replace function app.ensure_demo() returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); mia uuid; jonas uuid; conv uuid; grp uuid; ini uuid; t0 timestamptz := clock_timestamp(); home uuid;
begin
  if me is null or not app.demo_visible() then return false; end if;
  if exists (select 1 from public.profiles where id = me and (is_demo or onboarded_at is null)) then return false; end if;
  -- Once per account; a lock so that two pages loading at the same time do not both make the set.
  perform pg_advisory_xact_lock(hashtext('demo:' || me::text));
  if exists (select 1 from public.demo_seeded where profile_id = me) then return false; end if;
  select id into mia from public.profiles where is_demo and alias::text = 'demo-mia';
  select id into jonas from public.profiles where is_demo and alias::text = 'demo-jonas';
  if mia is null or jonas is null then return false; end if;
  insert into public.demo_seeded (profile_id) values (me);
  select home_region_id into home from public.profiles where id = me;

  -- One chat, one message.
  insert into public.conversations (title, last_message_at, demo) values (null, now(), true) returning id into conv;
  insert into public.conversation_participants (conversation_id, profile_id, last_read_at) values (conv, me, now() - interval '1 day'), (conv, mia, now());
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, mia, 'Hallo! Ich bin Mia, eine Beispielperson. So sieht ein Chat aus: Antworte ruhig, oder schalte oben unter „Werkzeuge“ Aufgaben und Dokumente für euch zwei ein.');

  -- One group of one's own, with Mia.
  insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, mod_tasks, created_by, owner_id, template, tools, cover_path, demo)
  values (app.unique_group_slug('Hausgemeinschaft Beispiel'), 'Hausgemeinschaft (Beispiel)', 'So sieht eine eigene Gruppe aus: Chat, Aufgaben, Dokumente.',
          'project', 'secret', 'invite', home, true, mia, mia, 'project', '{tasks,links,collection}', 'demo/hinterhof.jpg', true)
  returning id into grp;
  insert into public.group_members (group_id, profile_id, role) values (grp, mia, 'admin'), (grp, me, 'contributor');
  perform app.seed_group_permissions(grp, 'project');
  insert into public.posts (author_id, group_id, body, demo) values (mia, grp, 'Willkommen in unserer Beispielgruppe! Wer übernimmt diese Woche den Müll?', true);
  insert into public.tasks (group_id, title, created_by, position) values (grp, 'Mülltonnen rausstellen (Beispiel)', mia, 0);

  -- One contact request, from Jonas.
  insert into public.contact_requests (from_profile_id, to_profile_id, message, demo)
  values (jonas, me, 'Hallo, ich bin Jonas, eine Beispielperson. So sieht eine Kontaktanfrage aus: Du kannst sie annehmen oder ablehnen.', true);

  -- Own things: an offer, a wanted post (only for oneself), a list and a note (both notes), support for the one initiative.
  insert into public.listings (kind, owner_id, title, description, pay_mode, region_id, status, category, read_scope, demo)
  values ('offer', me, 'Blumen gießen im Urlaub (Beispiel)', 'So sieht ein eigenes Angebot aus. Nur du siehst es.', 'free', home, 'active', 'help', 'me', true),
         ('need', me, 'Leiter für einen Nachmittag (Beispiel)', 'So sieht ein eigenes Gesuch aus. Nur du siehst es.', 'free', home, 'active', 'item', 'me', true);
  insert into public.resources (owner_id, host, provider, kind, origin, title, body_md, visibility, allow_download, demo)
  values (me, 'hivevoice', 'note', 'note', 'note', 'Einkauf fürs Hoffest (Beispiel)', E'- [ ] Brot\n- [ ] Getränke', 'me', false, true),
         (me, 'hivevoice', 'note', 'note', 'note', 'Erste Notiz (Beispiel)', app.demo_note_body(), 'me', false, true);
  select id into ini from public.initiatives where demo order by created_at limit 1;
  if ini is not null then insert into public.initiative_supports (initiative_id, profile_id) values (ini, me) on conflict do nothing; end if;

  -- Whatever the inserts announced belongs to the examples too.
  update public.notifications set demo = true where profile_id = me and created_at >= t0;
  return true;
end $$;
