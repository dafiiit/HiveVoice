-- Demo links for "Wissen": recipes, code, maps, design, data. Only metadata, no files.
-- Loaded by npm run db:seed right after demo.sql. Removed together with the demo profiles.

do $links$
declare
  g_film uuid;
begin
  if not exists (select 1 from public.profiles where is_demo) then raise notice 'no demo profiles'; return; end if;
  if exists (select 1 from public.resources r join public.profiles p on p.id = r.owner_id where p.is_demo) then raise notice 'demo links already present'; return; end if;
  select id into g_film from public.groups where name like 'Kurzfilm%' order by created_at limit 1;

  create temp table demo_links (owner text, url text, host text, provider text, kind text, title text, descr text, image text, safety text, tags text[], in_film boolean, votes int, down int) on commit drop;
  insert into demo_links values
    ('Aylin Demir', 'https://de.wikipedia.org/wiki/Linsensuppe', 'de.wikipedia.org', 'wiki', 'page', 'Linsensuppe: Geschichte und Zutaten',
      'Grundlagen und Varianten der Linsensuppe. Gut als Startpunkt, wenn man ein eigenes Rezept sucht.', null, 'trusted', array['rezept','essen','kochen'], false, 9, 0),
    ('Felix Wolf', 'https://github.com/supabase/supabase', 'github.com', 'github', 'code', 'supabase/supabase',
      'Die offene Firebase-Alternative, auf der HiveVoice läuft. Zum Nachlesen, wie Datenbank, Login und Speicher zusammenspielen.', null, 'trusted', array['code','datenbank','open-source'], false, 14, 1),
    ('Lea Hofmann', 'https://www.google.com/maps/place/Westpark,+M%C3%BCnchen', 'www.google.com', 'maps', 'map', 'Westpark München',
      'Treffpunkt für unser Volleyball-Training am Mittwoch, mit den zwei Sandfeldern.', null, 'trusted', array['karte','sport','volleyball'], false, 11, 0),
    ('Katrin Albers', 'https://www.openstreetmap.org/relation/62428', 'www.openstreetmap.org', 'maps', 'map', 'München auf OpenStreetMap',
      'Freie Karte der Stadt. Radwege, Trinkwasserbrunnen und Bänke sind eingetragen und können ergänzt werden.', null, 'trusted', array['karte','radverkehr','wasser'], false, 17, 0),
    ('Nora Fischer', 'https://www.figma.com/community', 'www.figma.com', 'figma', 'design', 'Figma Community: Vorlagen für Plakat und Storyboard',
      'Kostenlose Vorlagen, die wir für das Plakat und das Storyboard unseres Kurzfilms nutzen.', null, 'trusted', array['design','film','vorlage'], true, 8, 0),
    ('Sophie Wagner', 'https://arxiv.org/pdf/1706.03762', 'arxiv.org', 'research', 'pdf', 'Attention Is All You Need (PDF)',
      'Wissenschaftliche Arbeit als PDF. Beispiel dafür, wie ein Dokument aus einem Archiv geteilt wird.', null, 'trusted', array['wissenschaft','pdf'], false, 5, 1),
    ('Mehmet Aydın', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'www.youtube.com', 'video', 'video', 'Big Buck Bunny: freier Kurzfilm',
      'Offen lizenzierter Animationsfilm, den wir als Anschauungsmaterial für unser Projekt nutzen.', 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg', 'trusted', array['film','video','lizenzfrei'], true, 13, 0),
    ('Paul Schneider', 'https://www.govdata.de/', 'www.govdata.de', 'data', 'dataset', 'GovData: Offene Daten Deutschland',
      'Das Datenportal für Deutschland: Verkehr, Umwelt, Haushalte. Gut für Argumente in Initiativen.', null, 'trusted', array['daten','offene-daten','initiative'], false, 10, 0);

  insert into public.resources (owner_id, group_id, url, host, provider, kind, title, description, preview, safety, region_id, created_at)
  select p.id, case when d.in_film then g_film end, d.url, d.host, d.provider, d.kind, d.title, d.descr,
         jsonb_build_object('title', d.title, 'description', d.descr, 'image', d.image, 'site', d.host),
         d.safety, p.home_region_id, now() - (random() * interval '9 days')
    from demo_links d join public.profiles p on p.is_demo and p.display_name = d.owner;

  insert into public.resource_tags (resource_id, tag_id)
  select r.id, t from demo_links d
    join public.resources r on r.url = d.url
    join public.profiles p on p.id = r.owner_id and p.is_demo
    cross join lateral unnest(app.ensure_tags(d.tags)) t
  on conflict do nothing;

  -- Votes from demo people
  insert into public.resource_votes (resource_id, profile_id, value)
  select r.id, v.id, 1
    from demo_links d join public.resources r on r.url = d.url
    join public.profiles p on p.id = r.owner_id and p.is_demo
    cross join lateral (select id from public.profiles where is_demo and id <> r.owner_id order by random() limit d.votes) v
  on conflict do nothing;
  insert into public.resource_votes (resource_id, profile_id, value)
  select r.id, v.id, -1
    from demo_links d join public.resources r on r.url = d.url
    join public.profiles p on p.id = r.owner_id and p.is_demo
    cross join lateral (select id from public.profiles where is_demo and id <> r.owner_id
                         and id not in (select profile_id from public.resource_votes where resource_id = r.id) order by random() limit d.down) v
  on conflict do nothing;
end $links$;
