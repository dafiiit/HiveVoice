-- Photos, direct messages, demo chats and a larger set of idea tags.

-- ───────────────────── light theme by default ─────────────────────
alter table public.user_settings alter column theme set default 'light';
update public.user_settings set theme = 'light' where theme = 'system';

-- ───────────────────── images ─────────────────────
-- Files live in object storage (Supabase Storage, bucket "images"; any
-- S3-compatible store works). The database only keeps the path
-- "<auth user id>/<file>" so a self-hosted instance can swap the store.
alter table public.profiles add column avatar_path text;
grant select (avatar_path) on public.profiles to anon, authenticated;

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (listing_id, path)
);
create index on public.listing_images (listing_id, position);
alter table public.listing_images enable row level security;
create policy read_all on public.listing_images for select using (true);
grant select on public.listing_images to anon, authenticated;

create or replace function app.valid_image_path(p_path text, p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|png|webp)$'
     and split_part(p_path, '/', 1) = (select auth_user_id::text from public.profiles where id = p_owner)
$$;

create or replace function app.set_avatar(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_path is not null and not app.valid_image_path(p_path, me) then raise exception 'invalid' using errcode = '23514'; end if;
  update public.profiles set avatar_path = p_path, updated_at = now() where id = me;
end $$;

create or replace function app.set_listing_images(p_listing uuid, p_paths text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); p text; i smallint := 0;
begin
  if not exists (select 1 from public.listings where id = p_listing and owner_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(array_length(p_paths, 1), 0) > 4 then raise exception 'invalid' using errcode = '23514'; end if;
  foreach p in array coalesce(p_paths, '{}') loop
    if not app.valid_image_path(p, me) then raise exception 'invalid' using errcode = '23514'; end if;
  end loop;
  delete from public.listing_images where listing_id = p_listing and not (path = any (coalesce(p_paths, '{}')));
  foreach p in array coalesce(p_paths, '{}') loop
    insert into public.listing_images (listing_id, path, position) values (p_listing, p, i)
    on conflict (listing_id, path) do update set position = excluded.position;
    i := i + 1;
  end loop;
end $$;

-- Supabase Storage: public bucket, members write only into their own folder.
do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

    drop policy if exists hv_images_insert on storage.objects;
    drop policy if exists hv_images_update on storage.objects;
    drop policy if exists hv_images_delete on storage.objects;
    create policy hv_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy hv_images_update on storage.objects for update to authenticated
      using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy hv_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $storage$;

-- The signed-in profile now carries its photo.
create or replace function app.session_profile(p_auth_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'alias', p.alias, 'real_name', p.real_name,
    'display_mode', p.display_mode, 'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
    'onboarded', p.onboarded_at is not null,
    'verified', app.profile_is_verified(p.id), 'home_region_id', p.home_region_id,
    'home_region', (select jsonb_build_object('name', r.name, 'level', r.level) from public.regions r where r.id = p.home_region_id),
    'is_admin', exists (select 1 from public.server_admins a where a.profile_id = p.id),
    'settings', (select to_jsonb(s) - 'profile_id' from public.user_settings s where s.profile_id = p.id),
    'unread', (select count(*) from public.notifications n where n.profile_id = p.id and n.read_at is null))
  from public.profiles p where p.auth_user_id = p_auth_user
$$;

-- ───────────────────── direct messages and requests ─────────────────────
-- A first message to someone without a listing in between: it arrives as a
-- request, and a conversation opens once the person accepts.
create or replace function app.request_direct(p_to uuid, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); conv uuid; rid uuid;
begin
  if p_to = me then raise exception 'own_profile'; end if;
  if char_length(coalesce(trim(p_message), '')) < 1 then raise exception 'body_required'; end if;
  if not exists (select 1 from public.profiles where id = p_to and onboarded_at is not null) then raise exception 'not_found'; end if;
  select c.id into conv from public.conversations c
    join public.conversation_participants a on a.conversation_id = c.id and a.profile_id = me
    join public.conversation_participants b on b.conversation_id = c.id and b.profile_id = p_to
   order by c.last_message_at desc limit 1;
  if conv is not null then return jsonb_build_object('conversation_id', conv); end if;
  select id into rid from public.contact_requests
   where listing_id is null and status = 'pending' and from_profile_id = me and to_profile_id = p_to;
  if rid is not null then return jsonb_build_object('request_id', rid); end if;
  insert into public.contact_requests (from_profile_id, to_profile_id, message)
  values (me, p_to, left(trim(p_message), 2000)) returning id into rid;
  perform app.notify(p_to, 'contact_request', jsonb_build_object('request_id', rid));
  return jsonb_build_object('request_id', rid);
end $$;

create or replace function app.withdraw_join_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.group_join_requests set status = 'withdrawn', decided_at = now()
   where id = p_request and profile_id = app.uid() and status = 'pending';
end $$;

-- ───────────────────── demo chats ─────────────────────
-- Gives a signed-in person a few conversations and requests with demo profiles
-- so Verbinden is not empty during the test phase. Needs the demo content
-- (npm run db:seed) and the setting demo_chats; "Remove demo data" on the admin
-- page deletes it again.
insert into public.app_settings (key, value) values ('demo_chats', 'true') on conflict do nothing;

create or replace function app.ensure_demo_chats() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.uid();
  lea uuid; felix uuid; ali uuid; mia uuid; jonas uuid; sabine uuid;
  conv uuid; rid uuid; lst uuid; grp uuid; t0 timestamptz := now();
begin
  if me is null or coalesce(app.setting('demo_chats') = 'true'::jsonb, false) is not true then return false; end if;
  if exists (select 1 from public.profiles where id = me and is_demo) then return false; end if;
  if exists (
    select 1 from public.conversation_participants mine
      join public.conversation_participants o on o.conversation_id = mine.conversation_id and o.profile_id <> me
      join public.profiles op on op.id = o.profile_id and op.is_demo
     where mine.profile_id = me)
  or exists (
    select 1 from public.contact_requests r join public.profiles op on op.id = case when r.from_profile_id = me then r.to_profile_id else r.from_profile_id end
     where (r.from_profile_id = me or r.to_profile_id = me) and op.is_demo) then
    return false;
  end if;

  select id into lea from public.profiles where is_demo and display_name = 'Lea Hofmann';
  select id into felix from public.profiles where is_demo and display_name = 'Felix Wolf';
  select id into ali from public.profiles where is_demo and display_name = 'Ali Rahimi';
  select id into mia from public.profiles where is_demo and display_name = 'Mia Schuster';
  select id into jonas from public.profiles where is_demo and display_name = 'Jonas Brandl';
  if lea is null or felix is null or ali is null then return false; end if;

  -- 1. Volleyball: two unread messages
  insert into public.conversations (title, last_message_at, created_at) values ('Volleyball am Mittwoch', t0 - interval '3 days', t0 - interval '3 days') returning id into conv;
  insert into public.conversation_participants (conversation_id, profile_id, last_read_at) values (conv, me, t0 - interval '2 days'), (conv, lea, t0);
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (conv, lea, 'Hi! Ich habe gesehen, dass du auch in Sendling wohnst. Hast du Lust, mittwochs bei uns mitzuspielen?', t0 - interval '3 days 2 hours'),
    (conv, me, 'Hallo Lea, sehr gern! Ich habe seit Jahren nicht mehr gespielt. Ist das okay?', t0 - interval '3 days 1 hour 40 minutes'),
    (conv, lea, 'Klar, wir spielen nur zum Spaß. Wir treffen uns um 19 Uhr an der Halle an der Plinganserstraße.', t0 - interval '3 days 1 hour 30 minutes'),
    (conv, me, 'Super, dann bin ich nächsten Mittwoch dabei.', t0 - interval '3 days 1 hour 20 minutes'),
    (conv, lea, 'Perfekt! Bring bitte Hallenschuhe mit.', t0 - interval '1 day 3 hours'),
    (conv, lea, 'Und falls jemand aus deinem Umfeld Lust hat: Wir suchen noch zwei Leute.', t0 - interval '1 day 3 hours' + interval '1 minute');

  -- 2. 3D help: the last word is Felix's, already read
  insert into public.conversations (title, last_message_at, created_at) values ('Hilfe beim 3D-Modellieren', t0 - interval '5 hours', t0 - interval '2 days') returning id into conv;
  insert into public.conversation_participants (conversation_id, profile_id, last_read_at) values (conv, me, t0), (conv, felix, t0 - interval '6 hours');
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (conv, me, 'Hallo Felix, ich suche jemanden, der mir beim Modellieren eines Trinkbrunnens hilft. Hättest du eine Stunde Zeit?', t0 - interval '2 days'),
    (conv, felix, 'Gern. Wie wäre es am Samstag um 11 Uhr? Bring am besten deine Skizzen mit.', t0 - interval '1 day 20 hours'),
    (conv, me, 'Passt. Ich schicke dir vorher noch die Maße.', t0 - interval '1 day 19 hours'),
    (conv, felix, 'Danke, dann bis Samstag!', t0 - interval '5 hours');

  -- 3. Bike repair
  insert into public.conversations (title, last_message_at, created_at) values ('Fahrrad flicken', t0 - interval '1 day', t0 - interval '1 day 4 hours') returning id into conv;
  insert into public.conversation_participants (conversation_id, profile_id, last_read_at) values (conv, me, t0), (conv, ali, t0 - interval '1 day');
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (conv, ali, 'Hallo! Hat dein Rad noch den platten Hinterreifen? Ich habe Flickzeug und am Sonntag Zeit.', t0 - interval '1 day 4 hours'),
    (conv, me, 'Das wäre klasse! Sonntagnachmittag passt bei mir.', t0 - interval '1 day 3 hours'),
    (conv, ali, 'Dann komm gegen 15 Uhr in die Hofeinfahrt. Bring das Rad einfach mit.', t0 - interval '1 day');

  -- 4. Someone writes to me first: a request waiting for my answer
  if mia is not null then
    insert into public.contact_requests (from_profile_id, to_profile_id, message, created_at)
    values (mia, me, 'Hallo, ich organisiere ein Straßenfest in Sendling und suche noch Leute, die beim Aufbau helfen. Hättest du Zeit?', t0 - interval '3 hours');
  end if;

  -- 5. I asked about an offer: waiting for the owner
  select l.id into lst from public.listings l join public.profiles o on o.id = l.owner_id and o.is_demo
   where l.kind = 'offer' and l.status = 'active' and l.owner_id not in (lea, felix, ali) order by l.created_at desc limit 1;
  if lst is not null then
    insert into public.contact_requests (listing_id, from_profile_id, to_profile_id, message, created_at)
    select l.id, me, l.owner_id, 'Hallo, ich würde dein Angebot gern nutzen. Wann passt es dir in dieser Woche?', t0 - interval '20 hours'
      from public.listings l where l.id = lst;
  end if;

  -- 6. I asked to join a group that decides on requests
  select g.id into grp from public.groups g join public.profiles c on c.id = g.created_by and c.is_demo
   where g.join_policy = 'request' and g.visibility = 'public' and g.archived_at is null
     and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id = me)
   order by g.created_at limit 1;
  if grp is not null then
    insert into public.group_join_requests (group_id, profile_id, message, created_at)
    values (grp, me, 'Hallo zusammen, das Thema interessiert mich sehr und ich würde gern mitmachen.', t0 - interval '2 days')
    on conflict do nothing;
  end if;
  return true;
end $$;

-- Removing demo data also removes the chats with demo profiles.
create or replace function app.admin_purge_demo() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.conversations where id in (
    select cp.conversation_id from public.conversation_participants cp join public.profiles p on p.id = cp.profile_id where p.is_demo);
  delete from public.groups where created_by in (select id from public.profiles where is_demo);
  delete from public.profiles where is_demo;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function app.set_avatar(text), app.set_listing_images(uuid, text[]), app.request_direct(uuid, text),
  app.withdraw_join_request(uuid), app.ensure_demo_chats() to authenticated, hivevoice_server;

-- ───────────────────── ideas for offers and requests ─────────────────────
insert into public.tags (slug, label, kind)
select s, initcap(replace(s, '-', ' ')), 'topic' from unnest(array[
  'nachbarschaftshilfe','kinderbetreuung','babysitten','seniorenhilfe','einkaufen','tierbetreuung','gassi-gehen','blumen-giessen',
  'umzug','renovieren','handwerk','elektrik','sanitaer','malern','moebel-aufbauen','naehen','reparieren','fahrrad-reparatur',
  'auto-hilfe','mitfahrgelegenheit','lastenrad','werkzeug-leihen','ausleihen','kochen','backen','essen','gemeinsames-essen',
  'foodsharing','urban-gardening','garten','pflanzen-tausch','kompost','nachhilfe','sprachen','deutsch-lernen','sprachcafe',
  'hausaufgaben','computerhilfe','smartphone-hilfe','programmieren','webdesign','fotografie','video','film','grafikdesign',
  'musik','instrumente-lernen','chor','band','tanzen','yoga','sport','laufen','fitness','volleyball','fussball','schwimmen',
  'wandern','radfahren','spielenachmittag','brettspiele','lesen','buchclub','schreiben','kunst','basteln','upcycling',
  'flohmarkt','kleidertausch','spenden','ehrenamt','integration','begleitung','arztbesuch','behoerdengang','formulare',
  'steuer','recht','beratung','gruenden','mentoring','coaching','fahrdienst','nachbarschaftsfest','strassenfest','repair-cafe',
  'muellsammeln','klima','energie-sparen','solar','mobilitaet','barrierefreiheit','gesellschaft','uebernachtung','umweltschutz',
  'wasser','verkehr','bildung','gesundheit','freizeit','jugend','senioren','familie','tiere','handarbeit','schach','theater'
]) as s
on conflict (slug) do nothing;
