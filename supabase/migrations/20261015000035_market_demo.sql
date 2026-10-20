-- Demo data for the market categories: existing demo listings get their category, and three new ones show
-- a job, a room and a ride. Only where the demo profiles exist (they can be purged in the admin area).
do $demo$
declare reg uuid; p jsonb;
begin
  select jsonb_object_agg(display_name, id) into p from public.profiles where is_demo;
  if p is null then return; end if;
  select l.region_id into reg from public.listings l join public.profiles o on o.id = l.owner_id and o.is_demo
   where l.title = 'Lastenrad für einen Tag' limit 1;

  update public.listings l set category = x.cat, attrs = x.attrs::jsonb
  from (values
    ('Bohrmaschine und Werkzeugkiste zum Ausleihen', 'item', '{"deal":"lend","condition":"used"}'),
    ('Lastenrad für einen Tag', 'item', '{"deal":"lend"}'),
    ('Schlafsofa im Wohnzimmer für Durchreisende', 'housing', '{"deal":"stay","furnished":true}'),
    ('Yoga in meinem Garten', 'event', '{"level":"all"}'),
    ('Kuchen backen und Leute kennenlernen, sonntags', 'event', '{"level":"all"}'),
    ('Eine Stunde Feedback zur Finanzierung deiner Gründung', 'help', '{"online":true}'),
    ('Nachhilfe in Mathe bis zur 10. Klasse', 'help', '{"online":true}')
  ) as x(title, cat, attrs)
  where l.title = x.title and l.owner_id in (select id from public.profiles where is_demo) and l.category = 'help' and l.attrs = '{}'::jsonb;

  if exists (select 1 from public.listings where title = 'Aushilfe im Café am Harras, 10 Stunden pro Woche') then return; end if;
  insert into public.listings (kind, owner_id, title, description, region_id, location_text, pay_mode, hourly_rate_cents, fixed_price_cents, category, attrs)
  select x.kind::public.listing_kind, (p ->> x.who)::uuid, x.title, x.descr, reg, x.loc, x.pay::public.pay_mode, x.rate, x.price, x.cat, x.attrs::jsonb
  from (values
    ('offer', 'Katrin Albers', 'Aushilfe im Café am Harras, 10 Stunden pro Woche', 'Vormittags Kaffee kochen und Kuchen verkaufen. Keine Erfahrung nötig.', 'Harras',
     'hourly', 1400, null::int, 'job', '{"employment":"minijob","remote":"onsite","hours":10,"field":"Gastronomie"}'),
    ('offer', 'Lena Schmid', 'WG-Zimmer in Sendling ab Dezember', 'Helles Zimmer in einer Dreier-WG, fünf Minuten zur U-Bahn.', 'Sendling',
     'fixed', null, 52000, 'housing', '{"deal":"share","rooms":1,"area":14,"from":"2026-12-01","furnished":true}'),
    ('need', 'Moritz Huber', 'Mitfahrt nach Augsburg am Freitag', 'Ich teile gern die Spritkosten.', 'Sendling',
     'free', null, null, 'ride', '{"from":"München","to":"Augsburg","date":"2026-10-30","time":"17:00"}')
  ) as x(kind, who, title, descr, loc, pay, rate, price, cat, attrs)
  where p ? x.who;

  insert into public.listing_tags (listing_id, tag_id)
  select li.id, tg from public.listings li cross join lateral unnest(app.ensure_tags(case li.title
      when 'Aushilfe im Café am Harras, 10 Stunden pro Woche' then array['minijob', 'gastronomie']
      when 'WG-Zimmer in Sendling ab Dezember' then array['wg', 'wohnen']
      else array['mitfahrt', 'augsburg'] end)) tg
  where li.owner_id in (select id from public.profiles where is_demo)
    and li.title in ('Aushilfe im Café am Harras, 10 Stunden pro Woche', 'WG-Zimmer in Sendling ab Dezember', 'Mitfahrt nach Augsburg am Freitag')
  on conflict do nothing;
end $demo$;
