-- Examples for tests and the review (npm run db:seed:test): the two example people Mia and Jonas with their public
-- examples (as migration 053 made them), and example people in cities across Germany and Europe with offers, wanted posts,
-- groups, public dates and pinboard posts, so filters by place and the matching can be tried out.
-- Everything hangs off example people (is_demo, demo = true): Verwaltung → Beispiele entfernen takes it all away again.
-- Running it twice changes nothing.

-- Places outside Germany: the country and one city each.
insert into public.regions (level, name, country_code, official_code, lat, lon)
select 'country', x.country, x.cc, x.cc, x.clat, x.clon from (values
  ('AT', 'Österreich', 47.6, 14.1), ('CH', 'Schweiz', 46.8, 8.2), ('NL', 'Niederlande', 52.2, 5.3), ('FR', 'Frankreich', 46.6, 2.4),
  ('PL', 'Polen', 52.1, 19.4), ('IT', 'Italien', 42.8, 12.6), ('ES', 'Spanien', 40.2, -3.6), ('DK', 'Dänemark', 56.0, 10.0)
) as x(cc, country, clat, clon)
on conflict (country_code, level, official_code) do nothing;
insert into public.regions (parent_id, level, name, country_code, official_code, lat, lon)
select c.id, 'municipality', x.city, x.cc, x.code, x.lat, x.lon from (values
  ('AT', 'AT-WIEN', 'Wien', 48.2082, 16.3738), ('CH', 'CH-ZUERICH', 'Zürich', 47.3769, 8.5417), ('NL', 'NL-AMSTERDAM', 'Amsterdam', 52.3676, 4.9041),
  ('FR', 'FR-PARIS', 'Paris', 48.8566, 2.3522), ('PL', 'PL-KRAKOW', 'Kraków', 50.0647, 19.9450), ('IT', 'IT-BOLOGNA', 'Bologna', 44.4949, 11.3426),
  ('ES', 'ES-BARCELONA', 'Barcelona', 41.3874, 2.1686), ('DK', 'DK-KOEBENHAVN', 'København', 55.6761, 12.5683)
) as x(cc, code, city, lat, lon)
join public.regions c on c.level = 'country' and c.country_code = x.cc and c.official_code = x.cc
on conflict (country_code, level, official_code) do nothing;

do $demo$
declare
  muc uuid; sendling uuid; mia uuid; jonas uuid; resp uuid; grp uuid; ini uuid; post uuid;
  r record; pid uuid; home uuid; lid uuid; i int := 0; people jsonb := '{}'::jsonb; tags uuid[];
begin
  select id into muc from public.regions where level = 'municipality' and official_code = '09162000';
  select id into sendling from public.regions where level = 'borough' and official_code = '09162000-06';
  if muc is null then raise notice 'no regions, no examples'; return; end if;
  sendling := coalesce(sendling, muc);

  -- ───────── Mia and Jonas with the public examples (the per-account set, app.ensure_demo, needs them) ─────────
  select id into mia from public.profiles where is_demo and alias::text = 'demo-mia';
  if mia is null then
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
  end if;

  -- ───────── example people in other places ─────────
  -- city: an AGS (Germany) or one of the codes above; then what they offer or look for, with the category and tags matching uses.
  for r in select * from (values
    ('berlin-lena',    'Lena Hofmann',    '11000000',      'Studentin · Mathe und Physik',        'offer', 'Nachhilfe in Mathe (Klasse 5–10)', 'Zwei Nachmittage in der Woche, in Kreuzberg oder online.', 'help', 'fixed', array['nachhilfe','bildung','mathe']),
    ('berlin-murat',   'Murat Kaya',      '11000000',      'Pendelt oft nach Leipzig',             'offer', 'Mitfahrt Berlin → Leipzig am Freitag', 'Abfahrt 17 Uhr am Ostkreuz, drei Plätze frei.', 'ride', 'swap', array['mitfahrt','leipzig','pendeln']),
    ('hamburg-svenja', 'Svenja Ohlsen',   '02000000',      'Gärtnerin in Wilhelmsburg',            'offer', 'Lastenrad zum Ausleihen', 'Ein Lastenrad mit Kindersitz, tageweise, in Wilhelmsburg.', 'item', 'free', array['lastenrad','fahrrad','ausleihen']),
    ('koeln-tim',      'Tim Becker',      '05315000',      'Zieht gerade um',                      'need',  'Hilfe beim Streichen der neuen Wohnung', 'Zwei Zimmer in Ehrenfeld, am Samstag, Farbe ist da.', 'help', 'swap', array['umzug','renovieren','handwerk']),
    ('leipzig-grete',  'Grete Sommer',    '14713000',      'Besucht ihre Familie in Berlin',       'need',  'Mitfahrt Leipzig → Berlin am Wochenende', 'Freitagabend hin, Sonntag zurück. Ich zahle Spritgeld.', 'ride', 'fixed', array['mitfahrt','berlin','pendeln']),
    ('freiburg-jan',   'Jan Albrecht',    '08311000',      'Hofladen im Dreisamtal',               'offer', 'Aushilfe im Hofladen (Minijob)', 'Samstags 8 bis 13 Uhr, Kasse und Gemüse auffüllen.', 'job', 'hourly', array['minijob','landwirtschaft','regional']),
    ('rostock-ole',    'Ole Petersen',    '13003000',      'Segellehrer',                          'offer', 'Segelkurs für Einsteiger', 'Vier Abende auf der Warnow, Boote stellt der Verein.', 'event', 'fixed', array['segeln','kurs','sport']),
    ('dresden-paula',  'Paula Richter',   '14612000',      'Zwei Kinder, Neustadt',                'need',  'Kinderfahrrad 20 Zoll', 'Gebraucht ist prima, gern gegen Kuchen.', 'item', 'swap', array['fahrrad','kinder','gebraucht']),
    ('frankfurt-ahmet','Ahmet Yılmaz',    '06412000',      'Fahrradmechaniker',                    'offer', 'Fahrrad reparieren in Bockenheim', 'Bremsen, Schaltung, Schlauch: am Samstagvormittag im Hinterhof.', 'help', 'swap', array['fahrrad-reparatur','fahrrad','handwerk']),
    ('hannover-inga',  'Inga Vogel',      '03241001',      'Arbeitet im Schichtdienst',            'need',  'Hundesitter für Bello gesucht', 'Dienstags und donnerstags eine Runde um den Maschsee.', 'help', 'hourly', array['hund','tiere','nachbarschaft']),
    ('augsburg-hannes','Hannes Bauer',    '09761000',      'Baut gerade ein Regal',                'need',  'Bohrmaschine fürs Wochenende', 'Nur für zwei Löcher in Beton, ich hole sie ab.', 'item', 'free', array['werkzeug','ausleihen','handwerk']),
    ('wien-lukas',     'Lukas Gruber',    'AT-WIEN',       'Forscht drei Monate in Kanada',        'offer', 'Zimmer zur Zwischenmiete im 7. Bezirk', 'Möbliert, 14 m², von Januar bis März.', 'housing', 'fixed', array['zwischenmiete','wohnen','wg']),
    ('zuerich-anna',   'Anna Meier',      'CH-ZUERICH',    'Lehrerin, spricht vier Sprachen',      'offer', 'Sprachcafé Deutsch–Französisch', 'Jeden Mittwoch im Quartierzentrum, ohne Anmeldung.', 'event', 'free', array['sprache','franzoesisch','tandem']),
    ('amsterdam-sanne','Sanne de Vries',  'NL-AMSTERDAM',  'Fährt alles mit dem Rad',              'offer', 'Fahrradanhänger zu verschenken', 'Für Kinder oder Einkäufe, etwas Rost, fährt gut.', 'item', 'free', array['fahrrad','verschenken','kinder']),
    ('paris-camille',  'Camille Martin',  'FR-PARIS',      'Schreibt eine Masterarbeit',           'need',  'Übersetzung Deutsch → Französisch', 'Zehn Seiten Interviews, gern gegen Hilfe beim Lektorat.', 'help', 'swap', array['uebersetzung','franzoesisch','sprache']),
    ('krakow-kasia',   'Kasia Nowak',     'PL-KRAKOW',     'Webentwicklerin',                      'offer', 'Webseiten für Vereine', 'Einfache Seiten mit Terminen, ehrenamtlich für kleine Vereine.', 'job', 'free', array['webentwicklung','verein','ehrenamt']),
    ('bologna-giulia', 'Giulia Rossi',    'IT-BOLOGNA',    'Köchin',                               'offer', 'Kochkurs Pasta fresca', 'Samstags in kleiner Runde, alles von Hand.', 'event', 'fixed', array['kochen','kurs','essen']),
    ('barcelona-marc', 'Marc Puig',       'ES-BARCELONA',  'Familie mit zwei Kindern',             'need',  'Wohnungstausch im August', 'Wir tauschen unsere Wohnung in Gràcia gegen eine in Deutschland.', 'housing', 'swap', array['wohnungstausch','wohnen','familie']),
    ('kbh-freja',      'Freja Jensen',    'DK-KOEBENHAVN', 'Fahrrad-Guide',                        'offer', 'Radtour durch Kopenhagen', 'Drei Stunden, die schönsten Radwege der Stadt.', 'event', 'fixed', array['fahrrad','tour','freizeit'])
  ) as x(alias, name, city, headline, kind, title, body, category, pay, tag_slugs) loop
    i := i + 1;
    select id into home from public.regions where official_code = r.city and level = 'municipality' order by country_code = 'DE' desc limit 1;
    continue when home is null;
    select id into pid from public.profiles where alias::text = 'demo-' || r.alias;
    continue when pid is not null;
    insert into public.profiles (display_mode, display_name, real_name, alias, avatar_seed, home_region_id, is_verified, verified_by,
                                 verified_at, onboarded_at, is_demo, headline, bio)
    values ('real', r.name, r.name, 'demo-' || r.alias, 40 + i * 13, home, true, 'demo', now(), now(), true, 'Beispielperson · ' || r.headline,
            'Ich bin eine Beispielperson zum Ausprobieren von Filtern und Vorschlägen.')
    returning id into pid;
    people := people || jsonb_build_object(r.alias, pid);
    insert into public.user_regions (profile_id, region_id) select pid, a from app.region_ancestors(home) a on conflict do nothing;
    insert into public.user_settings (profile_id) values (pid) on conflict do nothing;
    tags := app.ensure_tags(r.tag_slugs);
    insert into public.user_interests (profile_id, tag_id, relation)
    select pid, t, case when r.kind = 'offer' then 'offers' else 'needs' end from unnest(tags) t on conflict do nothing;
    insert into public.listings (kind, owner_id, title, description, pay_mode, hourly_rate_cents, fixed_price_cents, swap_text, region_id,
                                 location_text, status, category, demo)
    values (r.kind::public.listing_kind, pid, r.title, r.body, r.pay::public.pay_mode, case when r.pay = 'hourly' then 1500 end,
            case when r.pay = 'fixed' then 2500 end, case when r.pay = 'swap' then 'Kuchen, Hilfe zurück oder Spritgeld' end, home,
            (select name from public.regions where id = home), 'active', r.category, true)
    returning id into lid;
    insert into public.listing_tags (listing_id, tag_id) select lid, t from unnest(tags) t on conflict do nothing;
    insert into public.posts (author_id, region_id, body, demo)
    values (pid, home, 'Beispielbeitrag aus ' || (select name from public.regions where id = home) || ': ' || r.body, true);
  end loop;

  -- A public group in some places, with a date of its own (Gemeinschaft → Termine shows them by place).
  for r in select * from (values
    ('hamburg-svenja', 'Gemeinschaftsgarten Wilhelmsburg', 'Beete, Kompost und ein Gartentag im Monat.', 'Gartentag', 'Saturday', 10, 'weekly'),
    ('freiburg-jan',   'Solawi Dreisamtal', 'Solidarische Landwirtschaft: wir teilen Ernte und Kosten.', 'Ernteverteilung', 'Thursday', 17, 'weekly'),
    ('koeln-tim',      'Repair-Café Ehrenfeld', 'Gemeinsam reparieren statt wegwerfen.', 'Repair-Café', 'Saturday', 14, 'monthly'),
    ('zuerich-anna',   'Sprachcafé Kreis 4', 'Sprachen lernen beim Kaffee.', 'Sprachcafé', 'Wednesday', 18, 'weekly'),
    ('kbh-freja',      'Cykelklub Nørrebro', 'Radfahren in der Gruppe, für alle Tempi.', 'Feierabendrunde', 'Tuesday', 18, 'weekly')
  ) as x(owner, gname, summary, ev, weekday, hour, recur) loop
    pid := (people ->> r.owner)::uuid;
    if pid is null then select id into pid from public.profiles where alias::text = 'demo-' || r.owner; end if;
    continue when pid is null or exists (select 1 from public.groups where name = r.gname and demo);
    select home_region_id into home from public.profiles where id = pid;
    insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, mod_tasks, created_by, owner_id, template, demo)
    values (app.unique_group_slug(r.gname), r.gname, 'Beispielgruppe: ' || r.summary, 'club', 'public', 'open', home, true, pid, pid, 'club', true)
    returning id into grp;
    insert into public.group_members (group_id, profile_id, role) values (grp, pid, 'admin');
    perform app.seed_group_permissions(grp, 'club');
    -- The next such weekday, at that hour local time.
    insert into public.events (group_id, owner_id, title, description, starts_at, duration_minutes, place, region_id, visibility, recur)
    values (grp, pid, r.ev, 'Beispieltermin von „' || r.gname || '“.',
            ((date_trunc('day', now() at time zone 'Europe/Berlin') + make_interval(days => ((array_position(array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], r.weekday) - extract(isodow from now() at time zone 'Europe/Berlin')::int + 7) % 7) + 1, hours => r.hour)) at time zone 'Europe/Berlin'),
            120, (select name from public.regions where id = home), home, 'public', r.recur);
    update public.groups set tools = tools || '{calendar}' where id = grp and not ('calendar' = any (tools));
  end loop;

  -- A public course date for the event listings (Kurse & Treffen).
  insert into public.events (listing_id, owner_id, title, starts_at, duration_minutes, place, region_id, visibility, recur)
  select l.id, l.owner_id, l.title, date_trunc('hour', now()) + interval '9 days 2 hours', 120, l.location_text, l.region_id, 'public', 'weekly'
  from public.listings l where l.demo and l.category = 'event' and not exists (select 1 from public.events e where e.listing_id = l.id);
end $demo$;

-- The examples are shown again.
insert into public.app_settings (key, value) values ('demo_visible', 'true') on conflict (key) do update set value = 'true';
