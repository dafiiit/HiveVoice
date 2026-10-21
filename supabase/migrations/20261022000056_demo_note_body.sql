-- The example note starts with text, not a heading that repeats its title.
update public.resources set body_md = E'Notizen schreibst du in **Markdown**: Listen, Links, Überschriften.\n\nErst siehst nur du sie, teilen kannst du später.'
 where demo and origin = 'note' and title = 'Erste Notiz (Beispiel)';
create or replace function app.demo_note_body() returns text language sql immutable as $$
  select E'Notizen schreibst du in **Markdown**: Listen, Links, Überschriften.\n\nErst siehst nur du sie, teilen kannst du später.'
$$;

create or replace function app.ensure_demo() returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); mia uuid; jonas uuid; conv uuid; grp uuid; lst uuid; ini uuid; t0 timestamptz := clock_timestamp(); home uuid;
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

  -- Own things: an offer, a wanted post (only for oneself), a list, a note; support for the one initiative.
  insert into public.listings (kind, owner_id, title, description, pay_mode, region_id, status, category, read_scope, demo)
  values ('offer', me, 'Blumen gießen im Urlaub (Beispiel)', 'So sieht ein eigenes Angebot aus. Nur du siehst es.', 'free', home, 'active', 'help', 'me', true),
         ('need', me, 'Leiter für einen Nachmittag (Beispiel)', 'So sieht ein eigenes Gesuch aus. Nur du siehst es.', 'free', home, 'active', 'item', 'me', true);
  insert into public.todo_lists (owner_id, title, demo) values (me, 'Einkauf fürs Hoffest (Beispiel)', true) returning id into lst;
  insert into public.todo_items (list_id, title, position) values (lst, 'Brot', 0), (lst, 'Getränke', 1);
  insert into public.resources (owner_id, host, provider, kind, origin, title, body_md, visibility, allow_download, demo)
  values (me, 'hivevoice', 'note', 'note', 'note', 'Erste Notiz (Beispiel)', app.demo_note_body(), 'me', false, true);
  select id into ini from public.initiatives where demo order by created_at limit 1;
  if ini is not null then insert into public.initiative_supports (initiative_id, profile_id) values (ini, me) on conflict do nothing; end if;

  -- Whatever the inserts announced belongs to the examples too.
  update public.notifications set demo = true where profile_id = me and created_at >= t0;
  return true;
end $$;
