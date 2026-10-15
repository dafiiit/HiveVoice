-- Demo chats: a person who already has requests with demo profiles still gets the chats,
-- and existing requests never make the seeding fail.

create or replace function app.ensure_demo_chats() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.uid();
  lea uuid; felix uuid; ali uuid; mia uuid; jonas uuid; sabine uuid;
  conv uuid; rid uuid; lst uuid; grp uuid; t0 timestamptz := now();
begin
  if me is null or coalesce(app.setting('demo_chats') = 'true'::jsonb, false) is not true then return false; end if;
  if exists (select 1 from public.profiles where id = me and is_demo) then return false; end if;
  -- Seeded once: a conversation with a demo profile marks it. Requests alone do not count.
  if exists (
    select 1 from public.conversation_participants mine
      join public.conversation_participants o on o.conversation_id = mine.conversation_id and o.profile_id <> me
      join public.profiles op on op.id = o.profile_id and op.is_demo
     where mine.profile_id = me) then
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
    values (mia, me, 'Hallo, ich organisiere ein Straßenfest in Sendling und suche noch Leute, die beim Aufbau helfen. Hättest du Zeit?', t0 - interval '3 hours')
    on conflict do nothing;
  end if;

  -- 5. I asked about an offer: waiting for the owner
  select l.id into lst from public.listings l join public.profiles o on o.id = l.owner_id and o.is_demo
   where l.kind = 'offer' and l.status = 'active' and l.owner_id not in (lea, felix, ali, me)
     and not exists (select 1 from public.contact_requests r where r.listing_id = l.id and r.from_profile_id = me)
   order by l.created_at desc limit 1;
  if lst is not null then
    insert into public.contact_requests (listing_id, from_profile_id, to_profile_id, message, created_at)
    select l.id, me, l.owner_id, 'Hallo, ich würde dein Angebot gern nutzen. Wann passt es dir in dieser Woche?', t0 - interval '20 hours'
      from public.listings l where l.id = lst
    on conflict do nothing;
  end if;

  -- 6. I asked to join a group that decides on requests
  select g.id into grp from public.groups g join public.profiles c on c.id = g.created_by and c.is_demo
   where g.join_policy = 'request' and g.visibility = 'public' and g.archived_at is null
     and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id = me)
     and not exists (select 1 from public.group_join_requests j where j.group_id = g.id and j.profile_id = me)
   order by g.created_at limit 1;
  if grp is not null then
    insert into public.group_join_requests (group_id, profile_id, message, created_at)
    values (grp, me, 'Hallo zusammen, das Thema interessiert mich sehr und ich würde gern mitmachen.', t0 - interval '2 days')
    on conflict do nothing;
  end if;
  return true;
end $$;
