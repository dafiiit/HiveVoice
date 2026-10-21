-- Example content, newly: exactly one example of each thing, and everybody meets each example exactly once.
--
-- In public (the same for everyone): two example people (Mia, a neighbour; Jonas, responsible for traffic),
-- one offer, one wanted post, one group to join, one initiative, one pinboard post with one reply.
-- For each account (app.ensure_demo, on the first visit): one chat with Mia, one group with Mia, one contact request
-- from Jonas, an own offer and an own wanted post, one to-do list, one note, support for the one initiative.
--
-- All of it carries demo = true (people: is_demo). The admin switches it off for everyone (setting demo_visible):
-- restrictive policies hide every demo row, nothing is deleted, switching on shows it again.

-- ───────────────────────── 1. the flag and the switch ─────────────────────────
alter table public.groups add column if not exists demo boolean not null default false;
alter table public.listings add column if not exists demo boolean not null default false;
alter table public.initiatives add column if not exists demo boolean not null default false;
alter table public.posts add column if not exists demo boolean not null default false;
alter table public.conversations add column if not exists demo boolean not null default false;
alter table public.contact_requests add column if not exists demo boolean not null default false;
alter table public.resources add column if not exists demo boolean not null default false;
alter table public.todo_lists add column if not exists demo boolean not null default false;
alter table public.responsibilities add column if not exists demo boolean not null default false;
alter table public.notifications add column if not exists demo boolean not null default false;

insert into public.app_settings (key, value) values ('demo_visible', 'true') on conflict (key) do nothing;
delete from public.app_settings where key = 'demo_chats';

create or replace function app.demo_visible() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = 'demo_visible') <> 'false'::jsonb, true)
$$;
grant execute on function app.demo_visible() to anon, authenticated, hivevoice_server;

create or replace function app.is_demo_group(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = p_group and demo)
$$;
create or replace function app.is_demo_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations where id = p_conv and demo)
$$;
create or replace function app.is_demo_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_profile and is_demo)
$$;
grant execute on function app.is_demo_group(uuid), app.is_demo_conversation(uuid), app.is_demo_profile(uuid) to anon, authenticated, hivevoice_server;

-- Restrictive: added to whatever the table already allows, so hiding needs no change to the existing rules.
create policy demo on public.profiles as restrictive for select using (not is_demo or app.demo_visible());
create policy demo on public.groups as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.listings as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.initiatives as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.posts as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.conversations as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.contact_requests as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.resources as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.todo_lists as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.responsibilities as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.notifications as restrictive for select using (not demo or app.demo_visible());
create policy demo on public.conversation_participants as restrictive for select using (app.demo_visible() or not app.is_demo_conversation(conversation_id));
create policy demo on public.messages as restrictive for select using (app.demo_visible() or not app.is_demo_conversation(conversation_id));
create policy demo on public.group_members as restrictive for select using (app.demo_visible() or not app.is_demo_group(group_id));
create policy demo on public.tasks as restrictive for select using (app.demo_visible() or not app.is_demo_group(group_id));
create policy demo on public.initiative_supports as restrictive for select using (app.demo_visible() or not exists (select 1 from public.initiatives i where i.id = initiative_id and i.demo));
create policy demo on public.todo_items as restrictive for select using (app.demo_visible() or not exists (select 1 from public.todo_lists l where l.id = list_id and l.demo));

-- ───────────────────────── 2. away with the old examples ─────────────────────────
delete from public.conversations where id in (
  select cp.conversation_id from public.conversation_participants cp join public.profiles p on p.id = cp.profile_id where p.is_demo);
delete from public.initiatives where created_by in (select id from public.profiles where is_demo)
  or id in (select a.initiative_id from public.initiative_authors a join public.profiles p on p.id = a.profile_id where p.is_demo);
delete from public.groups where created_by in (select id from public.profiles where is_demo);
delete from public.listings where owner_id in (select id from public.profiles where is_demo);
delete from public.resources where owner_id in (select id from public.profiles where is_demo);
delete from public.posts where author_id in (select id from public.profiles where is_demo);
delete from public.responsibilities where holder_id in (select id from public.profiles where is_demo);
delete from public.profiles where is_demo;

-- ───────────────────────── 3. the public examples ─────────────────────────
do $demo$
declare
  muc uuid; sendling uuid; mia uuid; jonas uuid; resp uuid; grp uuid; ini uuid; post uuid;
begin
  select id into muc from public.regions where level = 'municipality' and official_code = '09162000';
  select id into sendling from public.regions where level = 'borough' and official_code = '09162000-06';
  if muc is null then raise notice 'no regions, no examples'; return; end if;
  sendling := coalesce(sendling, muc);

  insert into public.profiles (display_mode, display_name, real_name, alias, avatar_seed, home_region_id, is_verified, verified_by,
                               verified_at, onboarded_at, is_demo, headline, bio)
  values ('real', 'Mia Schuster', 'Mia Schuster', 'demo-mia', 21, sendling, true, 'demo', now(), now(), true,
          'Beispielperson · Nachbarin in Sendling', 'Ich bin eine Beispielperson: So sieht ein Profil aus. Ich repariere gern Dinge und mag den Westpark.')
  returning id into mia;
  insert into public.profiles (display_mode, display_name, real_name, alias, avatar_seed, home_region_id, is_verified, verified_by,
                               verified_at, onboarded_at, is_demo, headline, bio)
  values ('real', 'Jonas Brandl', 'Jonas Brandl', 'demo-jonas', 28, sendling, true, 'demo', now(), now(), true,
          'Beispielperson · Bezirksausschuss Sendling', 'Ich bin eine Beispielperson für Zuständige: Wer mich sucht, findet mich unter „zuständig verkehr“.')
  returning id into jonas;
  insert into public.user_regions (profile_id, region_id) select x, a from unnest(array[mia, jonas]) x, app.region_ancestors(sendling) a on conflict do nothing;
  insert into public.user_settings (profile_id) values (mia), (jonas) on conflict do nothing;

  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, is_official, official_domain,
                                       official_verified_at, avg_response_days, demo)
  values (jonas, 'Verkehr und Radwege', 'Bezirksausschuss 6 Sendling', 'Beispiel: Radwege, Ampeln und Verkehrsberuhigung in Sendling', sendling,
          true, 'muenchen.de', now(), 7, true)
  returning id into resp;
  insert into public.responsibility_holders (responsibility_id, profile_id) values (resp, jonas) on conflict do nothing;

  insert into public.groups (slug, name, summary, description, kind, visibility, join_policy, region_id, mod_tasks, created_by, owner_id,
                             template, cover_path, demo)
  values (app.unique_group_slug('Repair-Café Harras'), 'Repair-Café Harras', 'Beispielgruppe: einmal im Monat gemeinsam reparieren.',
          'So sieht eine Gruppe aus, der man beitreten kann. Jeden ersten Samstag reparieren wir Fahrräder, Toaster und Kleidung.',
          'club', 'public', 'open', sendling, true, mia, mia, 'club', 'demo/repair-cafe.jpg', true)
  returning id into grp;
  insert into public.group_members (group_id, profile_id, role) values (grp, mia, 'admin');
  perform app.seed_group_permissions(grp, 'club');

  insert into public.initiatives (title, summary, body, region_id, phase, addressee_responsibility_id, created_by, lead_id, published_at,
                                  cover_seed, cover_path, demo)
  values ('Sichere Radspur Lindwurmstraße', 'Beispielinitiative: ein baulich getrennter Radweg zwischen Sendlinger Tor und Goetheplatz.',
          'So sieht eine Initiative aus. Auf der Lindwurmstraße passieren die meisten Radunfälle in Sendling. Wir fordern eine baulich getrennte Radspur auf beiden Seiten.',
          muc, 'debate', resp, mia, mia, now() - interval '10 days', 1, 'demo/radspur.jpg', true)
  returning id into ini;
  insert into public.initiative_authors (initiative_id, profile_id) values (ini, mia);

  insert into public.listings (kind, owner_id, title, description, pay_mode, region_id, location_text, status, category, demo)
  values ('offer', mia, 'Bohrmaschine zum Ausleihen', 'Beispielangebot: Akku-Bohrmaschine mit Bits, für ein Wochenende.', 'free', sendling,
          '81369 München', 'active', 'item', true),
         ('need', jonas, 'Hilfe beim Umzug am Samstag', 'Beispielgesuch: zwei Stunden tragen, vom 3. Stock ins Erdgeschoss.', 'swap', sendling,
          '81371 München', 'active', 'help', true);
  update public.listings set swap_text = 'Kuchen und Kaffee' where owner_id = jonas and demo;

  insert into public.posts (author_id, region_id, body, demo)
  values (mia, sendling, 'Beispielbeitrag: Wer hat Lust auf ein Hoffest im Juni? Bierbänke haben wir schon, es fehlt noch Musik.', true)
  returning id into post;
  insert into public.posts (author_id, region_id, parent_id, body, demo)
  values (jonas, sendling, post, 'Beispielantwort: Gute Idee! Ich frage beim Bezirksausschuss nach einem Zuschuss.', true);
end $demo$;

-- ───────────────────────── 4. each account's own examples ─────────────────────────
create table if not exists public.demo_seeded (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.demo_seeded enable row level security;

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
  values (me, 'hivevoice', 'note', 'note', 'note', 'Erste Notiz (Beispiel)', E'# Erste Notiz\n\nNotizen schreibst du in **Markdown**. Erst siehst nur du sie, teilen kannst du später.', 'me', false, true);
  select id into ini from public.initiatives where demo order by created_at limit 1;
  if ini is not null then insert into public.initiative_supports (initiative_id, profile_id) values (ini, me) on conflict do nothing; end if;

  -- Whatever the inserts announced belongs to the examples too.
  update public.notifications set demo = true where profile_id = me and created_at >= t0;
  return true;
end $$;
grant execute on function app.ensure_demo() to authenticated, hivevoice_server;

-- Old name, still called by pages that are not deployed yet.
create or replace function app.ensure_demo_chats() returns boolean
language sql security definer set search_path = '' as $$ select app.ensure_demo() $$;

-- Removing for good stays possible (the switch is the usual way).
create or replace function app.admin_purge_demo() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.conversations where demo;
  delete from public.groups where demo;
  delete from public.initiatives where demo;
  delete from public.listings where demo;
  delete from public.resources where demo;
  delete from public.todo_lists where demo;
  delete from public.contact_requests where demo;
  delete from public.posts where demo;
  delete from public.notifications where demo;
  delete from public.responsibilities where demo;
  delete from public.profiles where is_demo;
  get diagnostics n = row_count;
  return n;
end $$;
