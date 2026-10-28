-- The test account (TEST_USER_EMAIL, filled in by scripts/seed-test.mjs as :email) gets what tests and the review look at:
-- the per-account examples again (Mia's chat, Jonas' request), a chat with Lena from Berlin, and a flat share with Mia and
-- Jonas that has expenses, a calendar and a cleaning rota. All of it is example data (demo), removed with the examples.
do $acc$
declare me uuid; mia uuid; jonas uuid; lena uuid; conv uuid; grp uuid; e1 uuid; home uuid; ev uuid;
begin
  select p.id, p.home_region_id into me, home from public.profiles p join auth.users u on u.id = p.auth_user_id where lower(u.email) = lower(:email);
  if me is null then raise notice 'no test account'; return; end if;
  select id into mia from public.profiles where is_demo and alias::text = 'demo-mia';
  select id into jonas from public.profiles where is_demo and alias::text = 'demo-jonas';
  select id into lena from public.profiles where is_demo and alias::text = 'demo-berlin-lena';
  if mia is null or jonas is null then raise notice 'run 01_examples first'; return; end if;

  -- The examples of one's own come back on the next page (app.ensure_demo makes them once per account).
  delete from public.demo_seeded where profile_id = me;

  if lena is not null and not exists (
    select 1 from public.conversation_participants a join public.conversation_participants b on b.conversation_id = a.conversation_id
    where a.profile_id = me and b.profile_id = lena) then
    insert into public.conversations (title, last_message_at, demo) values (null, now() - interval '2 hours', true) returning id into conv;
    insert into public.conversation_participants (conversation_id, profile_id, last_read_at) values (conv, me, now() - interval '3 hours'), (conv, lena, now());
    insert into public.messages (conversation_id, sender_id, body, created_at) values
      (conv, lena, 'Hi! Ich habe gesehen, dass du Nachhilfe suchst. Mathe oder Physik?', now() - interval '3 hours'),
      (conv, me, 'Mathe, Klasse 8. Passt dir Dienstag?', now() - interval '150 minutes'),
      (conv, lena, 'Dienstag 16 Uhr geht. Online oder in Kreuzberg?', now() - interval '2 hours');
  end if;

  if not exists (select 1 from public.groups g join public.group_members m on m.group_id = g.id and m.profile_id = me where g.demo and g.name = 'WG Lindwurmstraße (Beispiel)') then
    insert into public.groups (slug, name, summary, kind, visibility, join_policy, region_id, mod_tasks, created_by, owner_id, template, tools, demo)
    values (app.unique_group_slug('WG Lindwurmstraße Beispiel'), 'WG Lindwurmstraße (Beispiel)', 'Beispiel-WG mit Ausgaben, Kalender und Putzplan.',
            'community', 'secret', 'invite', home, true, me, me, 'project', '{tasks,expenses,calendar,links}', true)
    returning id into grp;
    insert into public.group_members (group_id, profile_id, role) values (grp, me, 'admin'), (grp, mia, 'contributor'), (grp, jonas, 'contributor');
    perform app.seed_group_permissions(grp, 'project');
    insert into public.posts (author_id, group_id, body, demo) values (mia, grp, 'Wer kauft diese Woche Klopapier? 🙃', true);

    -- Three expenses: groceries split equally, internet paid by Mia, and Jonas settling up part of it.
    insert into public.expenses (group_id, title, amount_cents, paid_by, spent_on, category, created_by)
    values (grp, 'Wocheneinkauf', 4500, me, current_date - 6, 'groceries', me) returning id into e1;
    insert into public.expense_shares (expense_id, profile_id, amount_cents) values (e1, me, 1500), (e1, mia, 1500), (e1, jonas, 1500);
    insert into public.expenses (group_id, title, amount_cents, paid_by, spent_on, category, created_by)
    values (grp, 'Internet Oktober', 3999, mia, current_date - 3, 'home', mia) returning id into e1;
    insert into public.expense_shares (expense_id, profile_id, amount_cents) values (e1, me, 1333), (e1, mia, 1333), (e1, jonas, 1333);
    insert into public.expenses (group_id, kind, title, amount_cents, paid_by, spent_on, split, created_by)
    values (grp, 'payment', 'Ausgleich', 1500, jonas, current_date - 1, 'exact', jonas) returning id into e1;
    insert into public.expense_shares (expense_id, profile_id, amount_cents, input) values (e1, me, 1500, 1500);

    -- A weekly cleaning rota for the three of us and a flat meeting next week.
    insert into public.events (group_id, owner_id, kind, title, starts_at, duration_minutes, recur, rsvp)
    values (grp, me, 'duty', 'Bad putzen', (date_trunc('day', now() at time zone 'Europe/Berlin') + interval '1 day 18 hours') at time zone 'Europe/Berlin', 60, 'weekly', false)
    returning id into ev;
    insert into public.duty_rotation (event_id, profile_id, position) values (ev, me, 1), (ev, mia, 2), (ev, jonas, 3);
    insert into public.events (group_id, owner_id, title, starts_at, duration_minutes, place)
    values (grp, mia, 'WG-Abend', (date_trunc('day', now() at time zone 'Europe/Berlin') + interval '5 days 19 hours') at time zone 'Europe/Berlin', 120, 'Küche');
  end if;
end $acc$;
