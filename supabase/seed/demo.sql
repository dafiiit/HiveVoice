-- Demo content for the test phase, based on the HiveVoice prototype.
-- Every row hangs off a profile with is_demo = true, so the admin page can
-- remove all of it with one click (app.admin_purge_demo).
-- Run with: npm run db:seed

do $seed$
declare
  de uuid; bay uuid; muc uuid; sendling uuid; augsburg uuid;
  p jsonb := '{}'::jsonb;
  names text[] := array['Lea Hofmann','Ali Rahimi','Mia Schuster','Jonas Brandl','Sabine Krüger','Emre Yıldız','Tobias Wenger',
    'Hanna Vogt','Klaus Meier','Mehmet Aydın','Miriam Okafor','Peter Lang','Sophie Wagner','Lukas Becker','Aylin Demir',
    'Paul Schneider','Nora Fischer','Ben Koch','Clara Neumann','Julia Hartmann','Felix Wolf','Lena Schmid','Anna Lehmann',
    'Moritz Huber','Katrin Albers'];
  aliases text[] := array['Stille Möwe','Flinker Fuchs','Glatter Kiesel'];
  n text; pid uuid; i int := 0;
  r_garten uuid; r_ba uuid; r_mobil uuid; r_swm uuid; r_kvr uuid; r_bildung uuid; r_stmb uuid; r_petition uuid; r_klima uuid;
  g_film uuid; g_volley uuid; g_rad uuid; g_garten uuid; g_band uuid; g_repair uuid;
  i_rad uuid; i_volley uuid; i_brunnen uuid; i_solar uuid; i_tempo uuid; i_bahn uuid;
  goal uuid; ballot uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; post uuid; l uuid; t uuid;
begin
  if exists (select 1 from public.profiles where is_demo) then
    raise notice 'demo data already present';
    return;
  end if;

  select id into de from public.regions where level = 'country' and official_code = 'DE';
  select id into bay from public.regions where level = 'state' and official_code = '09';
  select id into muc from public.regions where level = 'municipality' and official_code = '09162000';
  select id into sendling from public.regions where level = 'borough' and official_code = '09162000-06';
  select id into augsburg from public.regions where level = 'municipality' and official_code = '09761000';

  -- People
  foreach n in array names loop
    i := i + 1;
    insert into public.profiles (display_mode, display_name, real_name, alias, avatar_seed, home_region_id, is_verified,
                                 verified_by, verified_at, onboarded_at, is_demo)
    values ('real', n, n, 'demo-' || i, i * 7, case when i % 4 = 0 then muc else sendling end, true, 'demo', now(), now(), true)
    returning id into pid;
    p := p || jsonb_build_object(n, pid);
    insert into public.user_regions (profile_id, region_id)
      select pid, a from app.region_ancestors(case when i % 4 = 0 then muc else sendling end) a;
    insert into public.user_settings (profile_id) values (pid);
  end loop;
  foreach n in array aliases loop
    i := i + 1;
    insert into public.profiles (display_mode, display_name, alias, avatar_seed, home_region_id, is_verified, verified_by,
                                 verified_at, onboarded_at, is_demo)
    values ('alias', n, n, i * 11, sendling, true, 'demo', now(), now(), true) returning id into pid;
    p := p || jsonb_build_object(n, pid);
    insert into public.user_regions (profile_id, region_id) select pid, a from app.region_ancestors(sendling) a;
  end loop;

  update public.profiles set headline = 'Business Angel · Klima und Energie', home_region_id = muc,
         bio = 'Ich unterstütze Gründungen, die Energie sparen oder erzeugen. Mentoring ist kostenlos.'
   where id = (p ->> 'Katrin Albers')::uuid;
  update public.profiles set headline = 'Architekt · 3D und Ton' where id = (p ->> 'Felix Wolf')::uuid;
  update public.profiles set headline = 'Regie, Storyboard' where id = (p ->> 'Nora Fischer')::uuid;

  -- Interests, offers, needs
  perform 1 from app.ensure_tags(array['radverkehr','sport','garten','musik','film','klima','bildung','wasser','verkehr',
    'umwelt','gesundheit','freizeit','3d-modellierung','blender','sprechen','angel-investment','mentoring','cad-konstruktion',
    'werkstatt','proberaum','genehmigung','stadtteilbudget','foerderung','nachhilfe','umzug','ausleihen','essen',
    'übernachtung','bewegung','gesellschaft','fahrrad-reparatur','vorführort','handwerk']);
  insert into public.user_interests (profile_id, tag_id, relation)
  select (p ->> x.who)::uuid, t2.id, x.rel from (values
    ('Katrin Albers','angel-investment','offers'), ('Katrin Albers','mentoring','offers'), ('Katrin Albers','klima','interest'),
    ('Felix Wolf','blender','offers'), ('Felix Wolf','3d-modellierung','offers'), ('Sophie Wagner','sprechen','offers'),
    ('Lukas Becker','3d-modellierung','offers'), ('Ben Koch','ausleihen','offers'), ('Ben Koch','umzug','offers'),
    ('Clara Neumann','nachhilfe','offers'), ('Moritz Huber','proberaum','needs'), ('Moritz Huber','musik','interest'),
    ('Lea Hofmann','sport','interest'), ('Sabine Krüger','radverkehr','interest'), ('Anna Lehmann','garten','interest'),
    ('Mehmet Aydın','essen','offers'), ('Lena Schmid','übernachtung','offers'), ('Aylin Demir','bewegung','offers')
  ) as x(who, tag, rel) join public.tags t2 on t2.slug = x.tag;

  -- Responsibilities ("Wer ist zuständig?")
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, is_official, official_domain, official_verified_at, avg_response_days)
  values ((p ->> 'Tobias Wenger')::uuid, 'Gartenbau Süd', 'Baureferat München', 'Ausstattung und Nutzung im Westpark und in den Grünanlagen in Sendling', sendling, true, 'muenchen.de', now(), 5)
  returning id into r_garten;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, is_official, official_domain, official_verified_at, avg_response_days)
  values ((p ->> 'Klaus Meier')::uuid, 'Unterausschuss Budget', 'Bezirksausschuss 6', 'Zuschüsse aus dem Stadtteilbudget bis 5.000 €', sendling, true, 'muenchen.de', now(), 18)
  returning id into r_ba;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, is_official, official_domain, official_verified_at, avg_response_days)
  values ((p ->> 'Peter Lang')::uuid, 'Radverkehr', 'Mobilitätsreferat München', 'Radwege und Radspuren im Stadtgebiet', muc, true, 'muenchen.de', now(), 21)
  returning id into r_mobil;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, is_official, official_domain, official_verified_at, avg_response_days)
  values ((p ->> 'Miriam Okafor')::uuid, 'Wasserversorgung', 'Stadtwerke München', 'Trinkwasser im öffentlichen Raum, Trinkbrunnen', muc, true, 'swm.de', now(), 14)
  returning id into r_swm;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, avg_response_days)
  values ((p ->> 'Hanna Vogt')::uuid, 'Bezirksinspektion Süd', 'Kreisverwaltungsreferat', 'Sondernutzung öffentlicher Raum: Stände, Feste, Aktionen', sendling, 12)
  returning id into r_kvr;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, avg_response_days)
  values ((p ->> 'Paul Schneider')::uuid, 'Schulbau', 'Referat für Bildung und Sport', 'Bau und Ausstattung städtischer Schulen', muc, 30)
  returning id into r_bildung;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, avg_response_days)
  values ((p ->> 'Jonas Brandl')::uuid, 'Wohnen, Bau und Verkehr', 'Bayerisches Staatsministerium', 'Straßenverkehrsrecht, Tempo 30 an Staatsstraßen', bay, 40)
  returning id into r_stmb;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, avg_response_days)
  values ((p ->> 'Lukas Becker')::uuid, 'Petitionsausschuss', 'Deutscher Bundestag', 'Petitionen an den Bund', de, 60)
  returning id into r_petition;
  insert into public.responsibilities (holder_id, title, organization_name, description, region_id, avg_response_days)
  values ((p ->> 'Ali Rahimi')::uuid, 'Hausmeister', 'Mittelschule Sendling', 'Schulhof, Turnhalle und Räume der Mittelschule am Abend', sendling, 3)
  returning id into r_klima;
  insert into public.responsibility_tags (responsibility_id, tag_id)
  select x.r, t2.id from (values (r_garten,'garten'),(r_garten,'sport'),(r_ba,'foerderung'),(r_ba,'stadtteilbudget'),
    (r_mobil,'radverkehr'),(r_mobil,'verkehr'),(r_swm,'wasser'),(r_kvr,'genehmigung'),(r_bildung,'bildung'),
    (r_stmb,'verkehr'),(r_klima,'werkstatt')) as x(r, tag) join public.tags t2 on t2.slug = x.tag;

  -- Groups
  insert into public.groups (slug, name, summary, description, kind, visibility, join_policy, region_id, created_by, cover_seed)
  values ('kurzfilm-wasserwege', 'Kurzfilm „Wasserwege“', 'Sechs Minuten Animation über Münchens vergessene Stadtbäche, gemacht von Nachbar:innen.',
          'Unter Sendling fließen Bäche, die kaum jemand kennt. Wir erzählen ihre Geschichte in sechs Minuten: von der Mühle bis zum Kanal unter der Straße. Lizenz: CC BY-SA 4.0.',
          'project', 'public', 'request', muc, (p ->> 'Nora Fischer')::uuid, 3) returning id into g_film;
  insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, created_by, cover_seed)
  values ('westpark-volleyball', 'Westpark Volleyball', 'Neue Linien, Pfosten und Netze für die Sandfelder im Westpark.', 'initiative', 'public', 'open', sendling, (p ->> 'Lea Hofmann')::uuid, 0)
  returning id into g_volley;
  insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, created_by, cover_seed)
  values ('radentscheid-sendling', 'Radentscheid Sendling', 'Sichere Radwege in Sendling, angefangen mit der Lindwurmstraße.', 'initiative', 'public', 'open', sendling, (p ->> 'Sabine Krüger')::uuid, 1)
  returning id into g_rad;
  insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, created_by, cover_seed)
  values ('gemeinschaftsgarten-harras', 'Gemeinschaftsgarten Harras', 'Hochbeete, Kompost und Kaffee. Jeden Samstag ab 10 Uhr.', 'community', 'public', 'open', sendling, (p ->> 'Anna Lehmann')::uuid, 2)
  returning id into g_garten;
  insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, created_by, cover_seed)
  values ('funk-band-sendling', 'Funk-Band Sendling', 'Funk-Cover, Proben donnerstags im Jugendzentrum. Wir suchen Bass.', 'club', 'public', 'request', sendling, (p ->> 'Moritz Huber')::uuid, 3)
  returning id into g_band;
  insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, created_by, cover_seed)
  values ('repair-cafe-harras', 'Repair-Café Harras', 'Reparieren statt wegwerfen, jeden ersten Samstag im Monat.', 'club', 'public', 'open', sendling, (p ->> 'Ben Koch')::uuid, 0)
  returning id into g_repair;
  perform app.seed_group_permissions(x) from unnest(array[g_film, g_volley, g_rad, g_garten, g_band, g_repair]) x;

  insert into public.group_members (group_id, profile_id, role, focus)
  select x.g, (p ->> x.who)::uuid, x.role::public.group_role, x.focus from (values
    (g_film,'Nora Fischer','admin','Regie, Storyboard'), (g_film,'Felix Wolf','maintainer','3D, Ton'),
    (g_film,'Clara Neumann','contributor','Recherche, Shader'), (g_film,'Ben Koch','contributor','Schnitt'),
    (g_film,'Anna Lehmann','contributor','Drehbuch'), (g_film,'Paul Schneider','guest','liest mit, gibt Feedback'),
    (g_volley,'Lea Hofmann','admin',null), (g_volley,'Ali Rahimi','maintainer',null), (g_volley,'Mia Schuster','contributor',null),
    (g_volley,'Jonas Brandl','contributor',null),
    (g_rad,'Sabine Krüger','admin',null), (g_rad,'Emre Yıldız','maintainer',null), (g_rad,'Hanna Vogt','contributor',null),
    (g_rad,'Stille Möwe','contributor',null),
    (g_garten,'Anna Lehmann','admin',null), (g_garten,'Aylin Demir','contributor',null), (g_garten,'Lena Schmid','contributor',null),
    (g_band,'Moritz Huber','admin',null), (g_band,'Julia Hartmann','contributor',null),
    (g_repair,'Ben Koch','admin',null), (g_repair,'Lukas Becker','contributor',null)
  ) as x(g, who, role, focus);
  insert into public.group_tags (group_id, tag_id)
  select x.g, t2.id from (values (g_film,'film'),(g_film,'wasser'),(g_volley,'sport'),(g_rad,'radverkehr'),(g_rad,'verkehr'),
    (g_garten,'garten'),(g_band,'musik'),(g_repair,'werkstatt')) as x(g, tag) join public.tags t2 on t2.slug = x.tag;

  -- Goals of the film group
  insert into public.goals (group_id, title, status, timeline, proposed_by, adopted_at, created_at)
  values (g_film, 'Premiere im Frühjahr 2027', 'adopted', 'bis 30. April 2027', (p ->> 'Nora Fischer')::uuid, now() - interval '40 days', now() - interval '47 days')
  returning id into goal;
  insert into public.goal_owners values (goal, (p ->> 'Nora Fischer')::uuid);
  insert into public.goals (group_id, parent_goal_id, title, status, done, position) values
    (g_film, goal, 'Storyboard Szenen 1 bis 6', 'adopted', true, 1),
    (g_film, goal, 'Szenen animieren · 3 von 6', 'adopted', false, 2),
    (g_film, goal, 'Ton und Musik', 'adopted', false, 3),
    (g_film, goal, 'Ort für die Premiere finden', 'adopted', false, 4);
  insert into public.listings (kind, owner_id, group_id, goal_id, title, description, region_id, pay_mode, hourly_rate_cents)
  values ('need', (p ->> 'Nora Fischer')::uuid, g_film, goal, 'Auer Mühlbach in Blender modellieren', 'Auer Mühlbach und zwei Brücken in Blender, etwa zwei Abende. Ehrenamtlich.', muc, 'free', null)
  returning id into l;
  insert into public.listing_tags select l, id from public.tags where slug in ('3d-modellierung', 'blender', 'film');
  insert into public.listings (kind, owner_id, group_id, goal_id, title, description, region_id, pay_mode, hourly_rate_cents)
  values ('need', (p ->> 'Nora Fischer')::uuid, g_film, goal, 'Erzählstimme für sechs Minuten Text', 'Erzählstimme mit Münchner Färbung. Probeaufnahme: ein Absatz, zwei Minuten.', muc, 'hourly', 3000)
  returning id into l;
  insert into public.listing_tags select l, id from public.tags where slug in ('sprechen', 'film');
  insert into public.listings (kind, owner_id, group_id, goal_id, title, description, region_id)
  values ('need', (p ->> 'Nora Fischer')::uuid, g_film, goal, 'Raum für die Premiere mit Beamer, etwa 80 Plätze', null, muc)
  returning id into l;
  insert into public.listing_tags select l, id from public.tags where slug in ('vorführort');

  insert into public.goals (group_id, title, status, timeline, proposed_by, adopted_at, created_at)
  values (g_film, 'Film frei im Netz veröffentlichen', 'adopted', 'nach der Premiere', (p ->> 'Clara Neumann')::uuid, now() - interval '40 days', now() - interval '47 days')
  returning id into goal;
  insert into public.goal_owners values (goal, (p ->> 'Clara Neumann')::uuid);
  insert into public.goals (group_id, parent_goal_id, title, status, done, position) values
    (g_film, goal, 'Lizenz festlegen: CC BY-SA', 'adopted', true, 1),
    (g_film, goal, 'Untertitel Deutsch und Englisch', 'adopted', false, 2);

  insert into public.goals (group_id, title, status, timeline, proposed_by)
  values (g_film, 'Schulvorführungen in Sendling', 'voting', 'Mai bis Juli 2027', (p ->> 'Felix Wolf')::uuid)
  returning id into goal;
  insert into public.goal_owners values (goal, (p ->> 'Felix Wolf')::uuid), (goal, (p ->> 'Ben Koch')::uuid);
  insert into public.goals (group_id, parent_goal_id, title, status, position) values
    (g_film, goal, 'Drei Schulen anfragen', 'voting', 1), (g_film, goal, 'Begleitmaterial für Lehrkräfte', 'voting', 2);
  insert into public.ballots (subject_type, goal_id, group_id, question, closes_at, created_by)
  values ('goal', goal, g_film, 'Schulvorführungen in Sendling', now() + interval '5 days', (p ->> 'Felix Wolf')::uuid)
  returning id into ballot;
  insert into public.ballot_participation (ballot_id, profile_id, segment)
  select ballot, (p ->> x)::uuid, 'member' from unnest(array['Felix Wolf','Ben Koch','Clara Neumann']) x;
  insert into private.ballot_votes (ballot_id, voter_token, segment, choice)
  select ballot, sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'member', c from unnest(array['yes','yes','no']) c;

  insert into public.tasks (group_id, title, status, hourly_rate_cents, created_by, position)
  select g_film, x.title, x.st::public.task_status, x.rate, (p ->> 'Nora Fischer')::uuid, x.pos from (values
    ('Erzählstimme aufnehmen','open',3000,1), ('Musikrechte klären','open',null,2), ('Szene 4 modellieren','in_progress',null,3),
    ('Archivkarten scannen','in_progress',null,4), ('Storyboard Szenen 1 bis 4','done',null,5), ('Tonaufnahmen Westermühlbach','done',2000,6)
  ) as x(title, st, rate, pos);
  insert into public.task_assignees (task_id, profile_id)
  select tk.id, (p ->> x.who)::uuid from (values ('Szene 4 modellieren','Felix Wolf'), ('Archivkarten scannen','Clara Neumann'),
    ('Storyboard Szenen 1 bis 4','Nora Fischer'), ('Tonaufnahmen Westermühlbach','Felix Wolf')) as x(title, who)
  join public.tasks tk on tk.group_id = g_film and tk.title = x.title;

  -- Group conversation posts
  insert into public.posts (author_id, group_id, body, is_pinned, created_at) values
    ((p ->> 'Nora Fischer')::uuid, g_film, 'So arbeiten wir: Ideen hier im Gespräch, Aufgaben im Board. Jede Szene hat eine verantwortliche Person.', true, now() - interval '20 days'),
    ((p ->> 'Clara Neumann')::uuid, g_film, 'Das Stadtarchiv hat uns alte Karten freigegeben. Damit können wir den Verlauf von 1890 zeigen.', false, now() - interval '2 days'),
    ((p ->> 'Felix Wolf')::uuid, g_film, 'Erste Tonaufnahmen vom Westermühlbach sind da. Das Plätschern unter der Brücke ist perfekt.', false, now() - interval '1 day'),
    ((p ->> 'Nora Fischer')::uuid, g_film, 'Das Storyboard für Szene 4 steht. Uns fehlt noch jemand, der den Auer Mühlbach in Blender modelliert.', false, now() - interval '5 hours'),
    ((p ->> 'Lea Hofmann')::uuid, g_volley, 'Die Pfosten sind da! Samstag ab 10 Uhr setzen wir sie ein. Wer bringt einen Spaten mit?', false, now() - interval '3 hours'),
    ((p ->> 'Ali Rahimi')::uuid, g_volley, 'Bin dabei und bringe zwei Spaten mit.', false, now() - interval '2 hours'),
    ((p ->> 'Anna Lehmann')::uuid, g_garten, 'Wer hat Lust, am Samstag neue Beete anzulegen? Werkzeug und Kaffee sind da.', false, now() - interval '4 hours'),
    ((p ->> 'Moritz Huber')::uuid, g_band, 'Wir suchen Bass für Funk-Cover. Proben donnerstags im Jugendzentrum.', false, now() - interval '6 hours');

  -- Marketplace in Munich
  insert into public.posts (author_id, region_id, body, created_at) values
    ((p ->> 'Hanna Vogt')::uuid, muc, 'Wer hat noch Platz im Hof für ein Nachbarschaftsfest im Juni? Wir hätten Bierbänke, Musik und zwei Grills.', now() - interval '12 minutes'),
    ((p ->> 'Stille Möwe')::uuid, muc, 'Ehrliche Frage: Bringt die Radspur auf der Lindwurmstraße wirklich weniger Verkehr, oder verlagert sie ihn nur in die Seitenstraßen?', now() - interval '34 minutes'),
    ((p ->> 'Aylin Demir')::uuid, muc, 'Yoga im Garten diesen Sonntag um 9 Uhr, noch zwei Plätze frei. Matten habe ich.', now() - interval '1 hour'),
    ((p ->> 'Moritz Huber')::uuid, muc, 'Gibt es in Sendling eigentlich irgendwo einen offenen Proberaum? Das Jugendzentrum ist dienstags ausgebucht.', now() - interval '3 hours'),
    ((p ->> 'Flinker Fuchs')::uuid, muc, 'Kleiner Hinweis: Die Bank am Harras ist seit Wochen kaputt. Habe es unter „Wer ist zuständig?“ gemeldet.', now() - interval '5 hours');
  select id into post from public.posts where region_id = muc and body like 'Wer hat noch Platz im Hof%';
  insert into public.posts (author_id, region_id, parent_id, body, created_at) values
    ((p ->> 'Mehmet Aydın')::uuid, muc, post, 'Unser Innenhof in der Daiserstraße ist groß genug. Schreib mir!', now() - interval '8 minutes'),
    ((p ->> 'Lena Schmid')::uuid, muc, post, 'Ich helfe beim Aufbau.', now() - interval '3 minutes');
  insert into public.post_votes (post_id, profile_id, value)
  select ps.id, pr.id, 1 from public.posts ps cross join lateral (
    select id from public.profiles where is_demo and id <> ps.author_id order by random() limit (3 + floor(random() * 12))::int) pr
  where ps.parent_id is null;

  -- Initiatives
  insert into public.initiatives (title, summary, body, body_easy, region_id, phase, addressee_responsibility_id, cost_estimate_cents,
                                  group_id, created_by, published_at, created_at, cover_seed)
  values ('Sichere Radspur Lindwurmstraße', 'Ein baulich getrennter Radweg zwischen Sendlinger Tor und Goetheplatz, auf beiden Seiten.',
          'Auf der Lindwurmstraße passieren die meisten Radunfälle in Sendling. Wir fordern eine baulich getrennte Radspur zwischen Sendlinger Tor und Goetheplatz, auf beiden Seiten.' || E'\n\n' ||
          'Für den Lieferverkehr sieht der Entwurf vier Ladezonen in den Seitenstraßen vor. Zunächst reichen Markierung und Poller, ein Umbau kann später folgen.',
          'Auf der Lindwurmstraße gibt es viele Unfälle mit Fahrrädern.' || E'\n' || 'Wir wollen einen eigenen Weg für Fahrräder.' || E'\n' || 'Autos und Fahrräder sind dann getrennt.',
          muc, 'debate', r_mobil, 45000000, g_rad, (p ->> 'Sabine Krüger')::uuid, now() - interval '70 days', now() - interval '70 days', 1)
  returning id into i_rad;
  insert into public.initiative_authors values (i_rad, (p ->> 'Sabine Krüger')::uuid), (i_rad, (p ->> 'Emre Yıldız')::uuid);

  insert into public.initiatives (title, summary, body, region_id, phase, addressee_responsibility_id, cost_estimate_cents, group_id,
                                  created_by, published_at, created_at, cover_seed)
  values ('Neue Volleyball-Linien im Westpark', 'Neue Linien, Pfosten und Netze für die zwei Sandfelder, selbst organisiert und mitfinanziert.',
          'Die Sandfelder im Westpark werden täglich genutzt, die Linien sind kaum noch sichtbar und ein Pfosten ist gebrochen. Wir erneuern Linien, Pfosten und Netze selbst und bitten den Bezirksausschuss um einen Zuschuss.',
          sendling, 'implementation', r_ba, 480000, g_volley, (p ->> 'Lea Hofmann')::uuid, now() - interval '180 days', now() - interval '180 days', 0)
  returning id into i_volley;
  insert into public.initiative_authors values (i_volley, (p ->> 'Lea Hofmann')::uuid), (i_volley, (p ->> 'Ali Rahimi')::uuid);
  insert into public.responsibility_requests (responsibility_id, initiative_id, author_id, body, status, decision, response_body, responded_by, responded_at, created_at, due_at)
  values (r_ba, i_volley, (p ->> 'Lea Hofmann')::uuid, 'Zuschuss für neue Linien, Pfosten und Netze an den Sandfeldern im Westpark.', 'answered', 'accepted',
          'Der Bezirksausschuss unterstützt die Erneuerung der Sandfelder und übernimmt 1.200 € aus dem Stadtteilbudget. Den Rest finanziert die Initiative selbst.',
          (p ->> 'Klaus Meier')::uuid, now() - interval '120 days', now() - interval '140 days', now() - interval '98 days');
  insert into public.tasks (group_id, title, status, created_by, position)
  select g_volley, x.t, x.s::public.task_status, (p ->> 'Lea Hofmann')::uuid, x.pos from (values
    ('Linienband kaufen','open',1), ('Termin mit dem Gartenbau klären','open',2), ('Antrag an den Bezirksausschuss','in_progress',3),
    ('Pfosten-Fundamente prüfen','in_progress',4), ('Pfosten bestellt','done',5), ('Felder vermessen','done',6)) as x(t, s, pos);

  insert into public.initiatives (title, summary, body, body_easy, region_id, phase, addressee_responsibility_id, cost_estimate_cents,
                                  created_by, published_at, created_at, cover_seed)
  values ('Trinkbrunnen am Harras', 'Ein kostenloser Trinkbrunnen an der Nordseite des Harras, neben der Tram-Haltestelle.',
          'Am Harras steigen täglich Tausende Menschen um. Im Sommer gibt es dort keinen Ort, an dem man kostenlos Wasser trinken kann.' || E'\n\n' ||
          'Wir fordern einen Trinkbrunnen an der Nordseite des Platzes, neben der Tram-Haltestelle. Die Stadtwerke betreiben in München bereits über 100 solcher Brunnen.' || E'\n\n' ||
          'Der Brunnen soll von April bis Oktober laufen. Pflege und Hygieneprüfung übernehmen die Stadtwerke, wie bei den bestehenden Brunnen.',
          'Am Harras gibt es kein Trinkwasser.' || E'\n' || 'Im Sommer ist es dort heiß.' || E'\n' || 'Wir wollen einen Trinkbrunnen.' || E'\n' || 'Das Wasser ist kostenlos.',
          sendling, 'idea', r_swm, 1800000, (p ->> 'Miriam Okafor')::uuid, now() - interval '13 days', now() - interval '13 days', 2)
  returning id into i_brunnen;
  insert into public.initiative_authors values (i_brunnen, (p ->> 'Miriam Okafor')::uuid), (i_brunnen, (p ->> 'Jonas Brandl')::uuid);

  insert into public.initiatives (title, summary, region_id, phase, addressee_responsibility_id, created_by, published_at, created_at, cover_seed)
  values ('Solardach auf der Grundschule', 'Eine Photovoltaikanlage auf dem Dach der Grundschule, mit Anzeige im Schulhaus.',
          sendling, 'done', r_bildung, (p ->> 'Paul Schneider')::uuid, now() - interval '400 days', now() - interval '400 days', 3)
  returning id into i_solar;
  insert into public.initiative_authors values (i_solar, (p ->> 'Paul Schneider')::uuid);

  insert into public.initiatives (title, summary, region_id, phase, outcome, addressee_responsibility_id, created_by, published_at, created_at, cover_seed)
  values ('Tempo 30 vor allen Schulen', 'Tempo 30 auf allen Straßen vor Schulen in Bayern, auch an Hauptstraßen.',
          bay, 'addressee', 'rejected_addressee', r_stmb, (p ->> 'Sophie Wagner')::uuid, now() - interval '300 days', now() - interval '300 days', 0)
  returning id into i_tempo;
  insert into public.initiative_authors values (i_tempo, (p ->> 'Sophie Wagner')::uuid);

  insert into public.initiatives (title, summary, region_id, phase, addressee_responsibility_id, created_by, published_at, created_at, cover_seed)
  values ('Klimaneutraler Nahverkehr 2035', 'Ein bundesweites Ziel: Busse und Bahnen fahren ab 2035 klimaneutral.',
          de, 'debate', r_petition, (p ->> 'Katrin Albers')::uuid, now() - interval '30 days', now() - interval '30 days', 1)
  returning id into i_bahn;
  insert into public.initiative_authors values (i_bahn, (p ->> 'Katrin Albers')::uuid);

  insert into public.initiative_tags select x.i, t2.id from (values (i_rad,'radverkehr'),(i_rad,'verkehr'),(i_rad,'umwelt'),
    (i_volley,'sport'),(i_volley,'freizeit'),(i_brunnen,'wasser'),(i_brunnen,'gesundheit'),(i_brunnen,'umwelt'),(i_solar,'klima'),
    (i_solar,'bildung'),(i_tempo,'verkehr'),(i_tempo,'bildung'),(i_bahn,'klima'),(i_bahn,'verkehr')) as x(i, tag)
    join public.tags t2 on t2.slug = x.tag;

  -- Supports
  insert into public.initiative_supports (initiative_id, profile_id)
  select x.i, pr.id from (values (i_rad, 20), (i_volley, 14), (i_brunnen, 9), (i_solar, 12), (i_tempo, 16), (i_bahn, 11)) as x(i, k)
  cross join lateral (select id from public.profiles where is_demo order by random() limit x.k) pr;

  -- Arguments: Radspur
  insert into public.arguments (initiative_id, side, body, sources, author_id, created_at) values
    (i_rad, 'pro', 'Auf der Lindwurmstraße passieren die meisten Radunfälle in Sendling. Eine baulich getrennte Spur schützt auch Fußgänger:innen, weil niemand mehr auf den Gehweg ausweicht.', '["Unfallatlas 2025"]', (p ->> 'Sabine Krüger')::uuid, now() - interval '6 days')
    returning id into a1;
  insert into public.arguments (initiative_id, side, body, sources, author_id, created_at) values
    (i_rad, 'pro', 'Geschäfte profitieren: Wer mit dem Rad kommt, kauft öfter und näher ein.', '["Difu-Studie 2023"]', (p ->> 'Emre Yıldız')::uuid, now() - interval '4 days')
    returning id into a2;
  insert into public.arguments (initiative_id, side, body, author_id, created_at) values
    (i_rad, 'pro', 'Die Spur ist schnell umsetzbar, weil zunächst Markierung und Poller reichen. Umbauen kann man später.', (p ->> 'Tobias Wenger')::uuid, now() - interval '2 days')
    returning id into a3;
  insert into public.arguments (initiative_id, side, body, author_id, created_at) values
    (i_rad, 'contra', 'Lieferverkehr braucht weiterhin Ladezonen, sonst parken Transporter in zweiter Reihe und blockieren Bus und Rad.', (p ->> 'Hanna Vogt')::uuid, now() - interval '5 days')
    returning id into a4;
  insert into public.arguments (initiative_id, side, body, author_id, created_at) values
    (i_rad, 'contra', 'Ein Fahrstreifen weniger verlagert Autoverkehr in die Wohnstraßen rund um den Gotzinger Platz.', (p ->> 'Klaus Meier')::uuid, now() - interval '3 days')
    returning id into a5;
  insert into public.argument_replies (argument_id, author_id, body) values
    (a4, (p ->> 'Sabine Krüger')::uuid, 'Der Entwurf sieht vier Ladezonen in den Seitenstraßen vor.'),
    (a4, (p ->> 'Hanna Vogt')::uuid, 'Das reicht, wenn sie auch kontrolliert werden.'),
    (a1, (p ->> 'Klaus Meier')::uuid, 'Die Zahlen überzeugen mich. Ich hätte mir trotzdem eine Lösung für den Lieferverkehr gewünscht.');
  -- Supporters: a pro camp, a contra camp, and arguments that convince both.
  insert into public.argument_supports (argument_id, profile_id)
  select x.a, (p ->> x.who)::uuid from (values
    (a1,'Lea Hofmann'),(a1,'Ali Rahimi'),(a1,'Mia Schuster'),(a1,'Emre Yıldız'),(a1,'Nora Fischer'),(a1,'Klaus Meier'),(a1,'Hanna Vogt'),(a1,'Mehmet Aydın'),
    (a2,'Lea Hofmann'),(a2,'Ali Rahimi'),(a2,'Sabine Krüger'),
    (a3,'Mia Schuster'),(a3,'Sabine Krüger'),(a3,'Mehmet Aydın'),
    (a4,'Klaus Meier'),(a4,'Hanna Vogt'),(a4,'Mehmet Aydın'),(a4,'Paul Schneider'),(a4,'Sabine Krüger'),(a4,'Lea Hofmann'),
    (a5,'Klaus Meier'),(a5,'Paul Schneider'),(a5,'Hanna Vogt'),(a5,'Peter Lang')
  ) as x(a, who);

  -- Arguments: Trinkbrunnen, Nahverkehr
  insert into public.arguments (initiative_id, side, body, author_id) values
    (i_brunnen, 'pro', 'Am Harras gibt es im Sommer keinen kostenlosen Zugang zu Trinkwasser.', (p ->> 'Miriam Okafor')::uuid),
    (i_brunnen, 'pro', 'Weniger Plastikflaschen im Müll rund um den Platz.', (p ->> 'Aylin Demir')::uuid),
    (i_brunnen, 'contra', 'Unterhalt und Hygieneprüfung kosten jedes Jahr Geld.', (p ->> 'Paul Schneider')::uuid),
    (i_bahn, 'pro', 'Planungssicherheit für Kommunen und Hersteller.', (p ->> 'Katrin Albers')::uuid),
    (i_bahn, 'contra', 'Ohne Finanzierungszusage bleibt das Ziel unverbindlich.', (p ->> 'Lukas Becker')::uuid);

  -- Threads
  insert into public.posts (author_id, initiative_id, body, created_at) values
    ((p ->> 'Sabine Krüger')::uuid, i_rad, 'Noch drei Tage. Neu: ein Kompromiss für Ladezonen in den Seitenstraßen. Lest ihn, bevor ihr abstimmt.', now() - interval '2 hours'),
    ((p ->> 'Stille Möwe')::uuid, i_rad, 'Guter Kompromiss. Ich bleibe bei Contra, aber diese Lösung würde ich mittragen.', now() - interval '90 minutes'),
    ((p ->> 'Miriam Okafor')::uuid, i_brunnen, 'Die Stadtwerke haben bestätigt: Am Harras liegt eine Leitung in 20 Metern. Das macht es deutlich günstiger.', now() - interval '3 hours'),
    ((p ->> 'Peter Lang')::uuid, i_brunnen, 'Ich habe am Samstag gezählt: 340 Menschen haben zwischen 12 und 14 Uhr an der Tram gewartet.', now() - interval '1 day');

  -- Running vote on the Radspur
  insert into public.ballots (subject_type, initiative_id, question, eligible_region_id, quorum_pct, closes_at, created_by)
  values ('initiative', i_rad, 'Soll die Stadt eine baulich getrennte Radspur auf der Lindwurmstraße bauen?', muc, 0,
          now() + interval '3 days', (p ->> 'Sabine Krüger')::uuid)
  returning id into ballot;
  insert into public.ballot_participation (ballot_id, profile_id, segment)
  select ballot, id, 'affected' from public.profiles where is_demo order by random() limit 12;
  insert into private.ballot_votes (ballot_id, voter_token, segment, choice)
  select ballot, sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'affected', c
  from unnest(array['yes','yes','yes','yes','yes','yes','yes','no','no','no','no','abstain']) c;

  -- Requests and offers
  insert into public.listings (kind, owner_id, title, description, region_id, location_text, schedule_text, pay_mode, hourly_rate_cents, swap_text, seats, cover_seed)
  select x.kind::public.listing_kind, (p ->> x.who)::uuid, x.title, x.descr, coalesce(x.reg, sendling), x.loc, x.sched,
         x.pay::public.pay_mode, x.rate, x.swap, x.seats, x.seed
  from (values
    ('offer','Ben Koch','Bohrmaschine und Werkzeugkiste zum Ausleihen', null, null::uuid, 'Plinganserstraße', 'am Wochenende', 'free', null::int, null, null::int, null::int),
    ('offer','Julia Hartmann','Kuchen backen und Leute kennenlernen, sonntags', 'Ich backe sowieso jeden Sonntag und freue mich über Gesellschaft.', null, 'Sendling', 'sonntags 15 Uhr', 'free', null, null, 2, null),
    ('offer','Mehmet Aydın','Übrig gebliebener Salat und Fladenbrot von meinem Dönerstand', null, null, 'Harras', 'heute bis 22 Uhr', 'free', null, null, 3, null),
    ('offer','Lena Schmid','Schlafsofa im Wohnzimmer für Durchreisende', null, null, 'Sendling', 'eine Nacht', 'free', null, null, 1, null),
    ('offer','Aylin Demir','Yoga in meinem Garten', 'Matten habe ich, bitte warme Kleidung mitbringen.', null, 'Mittersendling', 'sonntags 9 Uhr', 'free', null, null, 3, 2),
    ('offer','Ben Koch','Fahrrad reparieren, mit Anleitung und Werkzeug', null, null, 'Repair-Café Harras', 'jeden 1. Samstag', 'free', null, null, null, 0),
    ('offer','Katrin Albers','Eine Stunde Feedback zur Finanzierung deiner Gründung', null, muc, 'München oder online', null, 'free', null, null, null, null),
    ('offer','Clara Neumann','Nachhilfe in Mathe bis zur 10. Klasse', null, null, 'Sendling oder online', null, 'hourly', 1800, null, null, null),
    ('offer','Felix Wolf','3D-Modellierung in Blender', 'Gebäude, Gelände und Wasser. Für Gemeinschaftsprojekte kostenlos.', muc, 'München', null, 'free', null, null, null, null),
    ('offer','Sophie Wagner','Sprechen und Vertonen', 'Erzählstimme, Hörspiel, Podcast.', muc, 'München', null, 'hourly', 3000, null, null, null),
    ('need','Paul Schneider','Zwei Leute, die beim Umzug tragen', null, null, 'Sendling', 'Samstag, 2 Stunden', 'hourly', 1500, null, 2, null),
    ('need','Moritz Huber','Proberaum für eine Funk-Band', 'Donnerstags abends, gern mit Schlagzeug.', null, 'Sendling', 'donnerstags', 'free', null, null, null, null),
    ('need','Anna Lehmann','Jemand, der mit meiner Oma einmal pro Woche spazieren geht', null, null, 'Harras', 'dienstags', 'free', null, null, null, null),
    ('need','Lena Schmid','Wer weiß, wie man einen Antrag beim Bezirksausschuss stellt?', null, null, 'online', null, 'free', null, null, null, null),
    ('need','Ali Rahimi','Lastenrad für einen Tag', null, null, 'Sendling', 'nächste Woche', 'swap', null, 'Kuchen', null, null)
  ) as x(kind, who, title, descr, reg, loc, sched, pay, rate, swap, seats, seed);
  insert into public.listing_tags (listing_id, tag_id)
  select li.id, t2.id from public.listings li join (values
    ('Bohrmaschine und Werkzeugkiste zum Ausleihen','ausleihen'), ('Kuchen backen und Leute kennenlernen, sonntags','gesellschaft'),
    ('Kuchen backen und Leute kennenlernen, sonntags','essen'), ('Übrig gebliebener Salat und Fladenbrot von meinem Dönerstand','essen'),
    ('Schlafsofa im Wohnzimmer für Durchreisende','übernachtung'), ('Yoga in meinem Garten','bewegung'),
    ('Fahrrad reparieren, mit Anleitung und Werkzeug','fahrrad-reparatur'), ('Fahrrad reparieren, mit Anleitung und Werkzeug','werkstatt'),
    ('Eine Stunde Feedback zur Finanzierung deiner Gründung','mentoring'), ('Nachhilfe in Mathe bis zur 10. Klasse','nachhilfe'),
    ('3D-Modellierung in Blender','3d-modellierung'), ('3D-Modellierung in Blender','blender'), ('Sprechen und Vertonen','sprechen'),
    ('Zwei Leute, die beim Umzug tragen','umzug'), ('Proberaum für eine Funk-Band','proberaum'), ('Proberaum für eine Funk-Band','musik'),
    ('Jemand, der mit meiner Oma einmal pro Woche spazieren geht','gesellschaft'),
    ('Wer weiß, wie man einen Antrag beim Bezirksausschuss stellt?','genehmigung'), ('Lastenrad für einen Tag','ausleihen')
  ) as x(title, tag) on x.title = li.title join public.tags t2 on t2.slug = x.tag
  where li.owner_id in (select id from public.profiles where is_demo)
  on conflict do nothing;

  -- Market categories: a job, a room and a ride, and the category of the listings above
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

  insert into public.listings (kind, owner_id, title, description, region_id, location_text, pay_mode, hourly_rate_cents, fixed_price_cents, category, attrs)
  select x.kind::public.listing_kind, (p ->> x.who)::uuid, x.title, x.descr, sendling, x.loc, x.pay::public.pay_mode, x.rate, x.price, x.cat, x.attrs::jsonb
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

  raise notice 'demo data created';
end $seed$;
