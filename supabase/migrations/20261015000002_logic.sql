-- HiveVoice logic: helpers, trusted functions, triggers, row level security.
-- Portable Postgres. The application server connects with a login role that is
-- a member of hivevoice_server. For user requests it switches to the role
-- "authenticated" (or "anon") and sets request.jwt.claims, so every policy below
-- applies exactly as it would through PostgREST.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'hivevoice_server') then
    create role hivevoice_server nologin;
  end if;
end $$;

-- user_interests also records what someone offers or needs
alter table public.user_interests add column relation text not null default 'interest'
  check (relation in ('interest', 'offers', 'needs'));
alter table public.user_interests drop constraint user_interests_pkey;
alter table public.user_interests add primary key (profile_id, tag_id, relation);

insert into public.app_settings (key, value) values
  ('verification_mode', '"login"'),   -- login: a login counts as verified (test phase); eid: only eID
  ('instance_name', '"HiveVoice"')
on conflict do nothing;

-- ───────────────────────── identity helpers ─────────────────────────
create or replace function app.claims() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(app.claims() ->> 'profile_id', '')::uuid,
    (select p.id from public.profiles p where p.auth_user_id = nullif(app.claims() ->> 'sub', '')::uuid)
  )
$$;

create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function app.verification_mode() returns text
language sql stable as $$ select coalesce(app.setting('verification_mode') #>> '{}', 'login') $$;

create or replace function app.profile_is_verified(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile
      and (p.is_verified or (app.verification_mode() = 'login' and p.auth_user_id is not null)))
$$;

create or replace function app.is_verified() returns boolean
language sql stable as $$ select app.profile_is_verified(app.uid()) $$;

create or replace function app.require_verified() returns uuid
language plpgsql stable as $$
declare v uuid := app.uid();
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not app.profile_is_verified(v) then raise exception 'not_verified' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function app.notify(p_profile uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, kind, payload)
  select p_profile, p_kind, coalesce(p_payload, '{}'::jsonb)
  where p_profile is not null
$$;

create or replace function app.slugify(p text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(
    translate(lower(p), 'äöüßéèáàóòíìúùç', 'aousseeaaooiiuuc'), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function app.ensure_tags(p_slugs text[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare s text; ids uuid[] := '{}'; v uuid;
begin
  foreach s in array coalesce(p_slugs, '{}') loop
    s := app.slugify(s);
    continue when s = '' or char_length(s) > 40;
    insert into public.tags (slug, label) values (s, s) on conflict (slug) do nothing;
    select id into v from public.tags where slug = s;
    ids := ids || v;
  end loop;
  return ids;
end $$;

create or replace function app.region_ancestors(p_region uuid) returns setof uuid
language sql stable as $$
  with recursive up as (
    select id, parent_id from public.regions where id = p_region
    union all
    select r.id, r.parent_id from public.regions r join up on r.id = up.parent_id
  ) select id from up
$$;

create or replace function app.random_alias() returns text
language sql volatile as $$
  select (array['Kiesel','Ahorn','Möwe','Lindwurm','Isar','Fuchs','Linde','Biber','Eule','Wiese',
                'Birke','Falke','Quelle','Hummel','Kranich','Otter','Mohn','Ulme','Reiher','Dachs'])
         [1 + floor(random() * 20)::int] || '-' || (1000 + floor(random() * 9000)::int)::text
$$;

-- ───────────────────────── groups ─────────────────────────
create or replace function app.group_role(p_group uuid) returns public.group_role
language sql stable security definer set search_path = '' as $$
  select role from public.group_members where group_id = p_group and profile_id = app.uid()
$$;

create or replace function app.can_read_group(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups g where g.id = p_group
                 and (g.visibility = 'public' or app.group_role(g.id) is not null))
$$;

create or replace function app.profile_has_group_permission(p_profile uuid, p_group uuid, p_perm public.group_permission)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r public.group_role; h public.perm_holder;
begin
  select role into r from public.group_members where group_id = p_group and profile_id = p_profile;
  if r = 'admin' then return true; end if;
  if p_perm <> 'read' and not app.profile_is_verified(p_profile) then return false; end if;
  h := case r when 'maintainer' then 'maintainer'::public.perm_holder
              when 'contributor' then 'contributor'::public.perm_holder
              when 'guest' then 'guest'::public.perm_holder
              else 'public'::public.perm_holder end;
  if h = 'public' and p_perm = 'read' then
    return exists (select 1 from public.groups where id = p_group and visibility = 'public');
  end if;
  return coalesce((select allowed from public.group_role_permissions
                   where group_id = p_group and holder = h and permission = p_perm), false);
end $$;

create or replace function app.has_group_permission(p_group uuid, p_perm public.group_permission) returns boolean
language sql stable as $$ select app.profile_has_group_permission(app.uid(), p_group, p_perm) $$;

create or replace function app.seed_group_permissions(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  perms public.group_permission[] := enum_range(null::public.group_permission);
  defaults jsonb := '{
    "maintainer":  [1,1,1,1,1,1,1,0,0,0],
    "contributor": [1,1,1,1,1,1,0,0,0,0],
    "guest":       [1,1,0,1,0,0,0,0,0,0],
    "public":      [1,0,0,1,0,0,0,0,0,0]}';
  h text; i int;
begin
  for h in select jsonb_object_keys(defaults) loop
    for i in 1 .. array_length(perms, 1) loop
      insert into public.group_role_permissions (group_id, holder, permission, allowed)
      values (p_group, h::public.perm_holder, perms[i], (defaults -> h ->> (i - 1))::int = 1)
      on conflict do nothing;
    end loop;
  end loop;
end $$;

create or replace function app.unique_group_slug(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare base text := left(app.slugify(p_name), 48); s text;
begin
  if base = '' then base := 'gruppe'; end if;
  s := base;
  while exists (select 1 from public.groups where slug = s) loop
    s := base || '-' || (100 + floor(random() * 900)::int);
  end loop;
  return s;
end $$;

create or replace function app.create_group(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); gid uuid;
begin
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'name_required'; end if;
  insert into public.groups (slug, name, summary, description, kind, visibility, join_policy, region_id,
                             mod_tasks, mod_files, mod_funding, mod_official, created_by)
  values (app.unique_group_slug(p ->> 'name'), trim(p ->> 'name'), p ->> 'summary', p ->> 'description',
          coalesce((p ->> 'kind')::public.group_kind, 'project'),
          coalesce((p ->> 'visibility')::public.visibility, 'public'),
          coalesce((p ->> 'join_policy')::public.join_policy, 'request'),
          nullif(p ->> 'region_id', '')::uuid,
          coalesce((p ->> 'mod_tasks')::boolean, true), false, false,
          coalesce((p ->> 'mod_official')::boolean, false), me)
  returning id into gid;
  insert into public.group_members (group_id, profile_id, role, focus) values (gid, me, 'admin', p ->> 'focus');
  perform app.seed_group_permissions(gid);
  insert into public.group_tags (group_id, tag_id)
    select gid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]')))))
    on conflict do nothing;
  return gid;
end $$;

create or replace function app.join_group(p_group uuid, p_message text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); g public.groups;
begin
  select * into g from public.groups where id = p_group and archived_at is null;
  if not found then raise exception 'group_not_found'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and profile_id = me) then return 'member'; end if;
  if g.join_policy = 'open' then
    insert into public.group_members (group_id, profile_id, role) values (p_group, me, 'contributor');
    return 'joined';
  end if;
  insert into public.group_join_requests (group_id, profile_id, message) values (p_group, me, p_message)
    on conflict do nothing;
  perform app.notify(m.profile_id, 'join_request', jsonb_build_object('group_id', p_group, 'group', g.name, 'slug', g.slug))
    from public.group_members m where m.group_id = p_group and m.role = 'admin';
  return 'requested';
end $$;

create or replace function app.decide_join_request(p_request uuid, p_accept boolean, p_role public.group_role default 'contributor')
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.group_join_requests; g public.groups;
begin
  select * into r from public.group_join_requests where id = p_request and status = 'pending';
  if not found then raise exception 'request_not_found'; end if;
  if not app.profile_has_group_permission(me, r.group_id, 'manage_members') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'admin' and app.group_role(r.group_id) <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.group_join_requests set status = case when p_accept then 'accepted'::public.request_status else 'declined'::public.request_status end,
         decided_by = me, decided_at = now() where id = p_request;
  select * into g from public.groups where id = r.group_id;
  if p_accept then
    insert into public.group_members (group_id, profile_id, role) values (r.group_id, r.profile_id, p_role) on conflict do nothing;
  end if;
  perform app.notify(r.profile_id, case when p_accept then 'join_accepted' else 'join_declined' end,
                     jsonb_build_object('group_id', g.id, 'group', g.name, 'slug', g.slug));
end $$;

create or replace function app.set_member_role(p_group uuid, p_profile uuid, p_role public.group_role) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); my_role public.group_role := app.group_role(p_group); target public.group_role;
begin
  if not app.profile_has_group_permission(me, p_group, 'manage_members') then raise exception 'forbidden' using errcode = '42501'; end if;
  select role into target from public.group_members where group_id = p_group and profile_id = p_profile;
  if target is null then raise exception 'not_a_member'; end if;
  if (target = 'admin' or p_role = 'admin') and my_role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if target = 'admin' and p_role <> 'admin'
     and (select count(*) from public.group_members where group_id = p_group and role = 'admin') = 1 then
    raise exception 'last_admin';
  end if;
  update public.group_members set role = p_role where group_id = p_group and profile_id = p_profile;
end $$;

create or replace function app.remove_member(p_group uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); target public.group_role;
begin
  select role into target from public.group_members where group_id = p_group and profile_id = p_profile;
  if target is null then return; end if;
  if p_profile <> me then
    if not app.profile_has_group_permission(me, p_group, 'manage_members') then raise exception 'forbidden' using errcode = '42501'; end if;
    if target = 'admin' and app.group_role(p_group) <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if target = 'admin' and (select count(*) from public.group_members where group_id = p_group and role = 'admin') = 1 then
    raise exception 'last_admin';
  end if;
  delete from public.group_members where group_id = p_group and profile_id = p_profile;
end $$;

-- ───────────────────────── goals and ballots ─────────────────────────
create or replace function app.propose_goal(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); gid uuid := (p ->> 'group_id')::uuid; goal uuid; sub text; need text; i int := 0;
        days int := least(greatest(coalesce((p ->> 'vote_days')::int, 7), 1), 60);
begin
  if not app.profile_has_group_permission(me, gid, 'propose_goals') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'title_required'; end if;
  insert into public.goals (group_id, title, description, timeline, due_date, proposed_by, status)
  values (gid, trim(p ->> 'title'), p ->> 'description', p ->> 'timeline', nullif(p ->> 'due_date', '')::date, me, 'voting')
  returning id into goal;
  insert into public.goal_owners (goal_id, profile_id)
    select goal, x::uuid from jsonb_array_elements_text(coalesce(p -> 'owners', jsonb_build_array(me::text))) x
    where exists (select 1 from public.group_members m where m.group_id = gid and m.profile_id = x::uuid)
    on conflict do nothing;
  for sub in select jsonb_array_elements_text(coalesce(p -> 'subgoals', '[]')) loop
    continue when trim(sub) = '';
    i := i + 1;
    insert into public.goals (group_id, parent_goal_id, title, status, proposed_by, position)
    values (gid, goal, trim(sub), 'voting', me, i);
  end loop;
  for need in select jsonb_array_elements_text(coalesce(p -> 'needs', '[]')) loop
    continue when char_length(trim(need)) < 3;
    insert into public.listings (kind, owner_id, group_id, goal_id, title, region_id)
    select 'need', me, gid, goal, trim(need), g.region_id from public.groups g where g.id = gid;
  end loop;
  insert into public.ballots (subject_type, goal_id, group_id, question, closes_at, created_by)
  values ('goal', goal, gid, trim(p ->> 'title'), now() + make_interval(days => days), me);
  perform app.notify(m.profile_id, 'goal_vote', jsonb_build_object('group_id', gid, 'slug', g.slug, 'group', g.name, 'goal', trim(p ->> 'title')))
    from public.group_members m join public.groups g on g.id = m.group_id
    where m.group_id = gid and m.profile_id <> me;
  return goal;
end $$;

create or replace function app.start_initiative_ballot(p_initiative uuid, p_question text, p_days int default 7, p_quorum int default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); i public.initiatives; bid uuid;
begin
  select * into i from public.initiatives where id = p_initiative;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from public.initiative_authors where initiative_id = p_initiative and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if i.phase <> 'debate' or i.outcome is not null then raise exception 'wrong_phase'; end if;
  if exists (select 1 from public.ballots where initiative_id = p_initiative and status = 'open') then raise exception 'ballot_running'; end if;
  insert into public.ballots (subject_type, initiative_id, question, eligible_region_id, quorum_pct, closes_at, created_by)
  values ('initiative', p_initiative, coalesce(nullif(trim(p_question), ''), i.title), i.region_id,
          least(greatest(coalesce(p_quorum, 0), 0), 100), now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 60)), me)
  returning id into bid;
  perform app.notify(s.profile_id, 'initiative_vote', jsonb_build_object('initiative_id', i.id, 'title', i.title))
    from public.initiative_supports s where s.initiative_id = p_initiative and s.profile_id <> me;
  return bid;
end $$;

create or replace function app.ballot_segment(p_ballot uuid, p_profile uuid) returns public.voter_segment
language plpgsql stable security definer set search_path = '' as $$
declare b public.ballots;
begin
  select * into b from public.ballots where id = p_ballot;
  if b.subject_type = 'goal' then
    if exists (select 1 from public.group_members where group_id = b.group_id and profile_id = p_profile and role <> 'guest') then
      return 'member';
    end if;
    return 'external';
  end if;
  if b.eligible_region_id is not null and exists (
       select 1 from public.user_regions where profile_id = p_profile and region_id = b.eligible_region_id) then
    return 'affected';
  end if;
  return 'external';
end $$;

-- Called only by the application server. The server computes the token as
-- HMAC(secret, profile_id || ballot_id); the database never sees the secret,
-- and no table links a profile to a choice.
create or replace function app.cast_vote(p_profile uuid, p_ballot uuid, p_token bytea, p_choice text) returns public.voter_segment
language plpgsql security definer set search_path = '' as $$
declare b public.ballots; seg public.voter_segment;
begin
  select * into b from public.ballots where id = p_ballot for share;
  if not found or b.status <> 'open' or now() not between b.opens_at and b.closes_at then raise exception 'ballot_closed'; end if;
  if not app.profile_is_verified(p_profile) then raise exception 'not_verified' using errcode = '42501'; end if;
  if not (b.options ? p_choice) then raise exception 'invalid_choice'; end if;
  if b.subject_type = 'goal' and not app.profile_has_group_permission(p_profile, b.group_id, 'vote_goals') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select segment into seg from public.ballot_participation where ballot_id = p_ballot and profile_id = p_profile;
  if seg is null then
    seg := app.ballot_segment(p_ballot, p_profile);
    insert into public.ballot_participation (ballot_id, profile_id, segment) values (p_ballot, p_profile, seg);
  else
    update public.ballot_participation set voted_at = now() where ballot_id = p_ballot and profile_id = p_profile;
  end if;
  insert into private.ballot_votes (ballot_id, voter_token, segment, choice) values (p_ballot, p_token, seg, p_choice)
  on conflict (ballot_id, voter_token) do update set choice = excluded.choice;
  return seg;
end $$;

create or replace function app.can_read_ballot(p_ballot uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ballots b where b.id = p_ballot
                 and (b.subject_type = 'initiative' or app.can_read_group(b.group_id)))
$$;

-- Turnout per segment, safe to show while the ballot is open (no choices).
create or replace function app.ballot_turnout(p_ballot uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'voters', (select jsonb_object_agg(segment, n) from (
       select segment, count(*) n from public.ballot_participation where ballot_id = p_ballot group by segment) s),
    'eligible', (select case b.subject_type
        when 'goal' then (select count(*) from public.group_members m where m.group_id = b.group_id and m.role <> 'guest')
        else (select count(distinct ur.profile_id) from public.user_regions ur
              join public.profiles p on p.id = ur.profile_id
              where ur.region_id = b.eligible_region_id and app.profile_is_verified(p.id)) end
      from public.ballots b where b.id = p_ballot))
  where app.can_read_ballot(p_ballot)
$$;

create or replace function app.close_ballot(p_ballot uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.ballots; res jsonb; segs jsonb; main text; y int; n int; voters int; eligible int;
        turnout numeric; passed boolean; i public.initiatives; g public.goals; grp public.groups;
begin
  select * into b from public.ballots where id = p_ballot for update;
  if b.status <> 'open' then return b.result; end if;
  select jsonb_object_agg(segment, counts) into segs from (
    select segment, jsonb_object_agg(choice, n) counts from (
      select segment::text, choice, count(*) n from private.ballot_votes where ballot_id = p_ballot group by 1, 2) c
    group by segment) s;
  segs := coalesce(segs, '{}'::jsonb);
  main := case b.subject_type when 'goal' then 'member' else 'affected' end;
  y := coalesce((segs -> main ->> 'yes')::int, 0);
  n := coalesce((segs -> main ->> 'no')::int, 0);
  voters := (select count(*) from public.ballot_participation where ballot_id = p_ballot and segment::text = main);
  eligible := coalesce((app.ballot_turnout(p_ballot) ->> 'eligible')::int, 0);
  turnout := case when eligible > 0 then round(100.0 * voters / eligible, 1) else 0 end;
  if b.subject_type = 'goal' then
    passed := y > n and voters * 2 >= eligible;
  else
    passed := y > n and turnout >= b.quorum_pct;
  end if;
  res := jsonb_build_object('segments', segs, 'main_segment', main, 'voters', voters, 'eligible', eligible,
                            'turnout_pct', turnout, 'passed', passed, 'closed_at', now());
  update public.ballots set status = 'closed', result = res where id = p_ballot;

  if b.subject_type = 'goal' then
    select * into g from public.goals where id = b.goal_id;
    select * into grp from public.groups where id = b.group_id;
    update public.goals set status = case when passed then 'adopted'::public.goal_status else 'rejected'::public.goal_status end,
           adopted_at = case when passed then now() end
     where id = b.goal_id or parent_goal_id = b.goal_id;
    perform app.notify(m.profile_id, case when passed then 'goal_adopted' else 'goal_rejected' end,
                       jsonb_build_object('group_id', grp.id, 'slug', grp.slug, 'group', grp.name, 'goal', g.title))
      from public.group_members m where m.group_id = b.group_id;
  else
    select * into i from public.initiatives where id = b.initiative_id;
    if passed then
      update public.initiatives set phase = 'addressee', response_due_at = now() + interval '6 weeks' where id = i.id;
      if i.addressee_responsibility_id is not null then
        insert into public.responsibility_requests (responsibility_id, initiative_id, author_id, body, due_at)
        values (i.addressee_responsibility_id, i.id, i.created_by,
                coalesce(i.summary, i.title), now() + interval '6 weeks');
      end if;
    else
      update public.initiatives set outcome = 'rejected_vote' where id = i.id;
    end if;
    perform app.notify(a.profile_id, case when passed then 'initiative_passed' else 'initiative_failed' end,
                       jsonb_build_object('initiative_id', i.id, 'title', i.title))
      from public.initiative_authors a where a.initiative_id = i.id;
  end if;
  return res;
end $$;

create or replace function app.tick() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.ballots where status = 'open' and closes_at <= now() loop
    perform app.close_ballot(r.id); n := n + 1;
  end loop;
  perform app.jury_timeouts();
  return n;
end $$;

-- ───────────────────────── initiatives ─────────────────────────
create or replace function app.create_initiative(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); iid uuid;
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 5 then raise exception 'title_required'; end if;
  if nullif(p ->> 'region_id', '') is null then raise exception 'region_required'; end if;
  insert into public.initiatives (title, summary, body, body_easy, region_id, addressee_responsibility_id, addressee_text,
                                  cost_estimate_cents, group_id, created_by, published_at)
  values (trim(p ->> 'title'), p ->> 'summary', p ->> 'body', nullif(p ->> 'body_easy', ''), (p ->> 'region_id')::uuid,
          nullif(p ->> 'addressee_responsibility_id', '')::uuid, nullif(p ->> 'addressee_text', ''),
          nullif(p ->> 'cost_estimate_cents', '')::bigint, nullif(p ->> 'group_id', '')::uuid, me,
          case when coalesce((p ->> 'publish')::boolean, true) then now() end)
  returning id into iid;
  insert into public.initiative_authors (initiative_id, profile_id) values (iid, me);
  insert into public.initiative_tags (initiative_id, tag_id)
    select iid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]')))))
    on conflict do nothing;
  return iid;
end $$;

create or replace function app.check_debate(p_initiative uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.initiatives i set phase = 'debate'
   where i.id = p_initiative and i.phase = 'idea' and (
     select count(distinct who) from (
       select author_id who from public.arguments where initiative_id = p_initiative
       union select author_id from public.posts where initiative_id = p_initiative
       union select r.author_id from public.argument_replies r join public.arguments a on a.id = r.argument_id
             where a.initiative_id = p_initiative) w) >= 2;
end $$;

create or replace function app.wilson_lower(k bigint, n bigint) returns numeric
language sql immutable as $$
  select case when coalesce(n, 0) = 0 then 0::numeric else greatest(0, (
    (k::numeric / n) + 0.8192 / (2 * n)
    - 1.28 * sqrt(((k::numeric / n) * (1 - k::numeric / n) + 0.8192 / (4 * n)) / n)
  ) / (1 + 0.8192 / n))::numeric(4,3) end
$$;

-- Bridge score: each supporter belongs to the camp (pro or contra) whose
-- arguments they support more often. An argument scores the lower bound of
-- its approval rate in the camp that likes it least, so only arguments that
-- convince both camps rise to the top.
create or replace function app.recompute_bridge(p_initiative uuid) returns void
language sql security definer set search_path = '' as $$
  with lean as (
    select s.profile_id, sum(case when a.side = 'pro' then 1 else -1 end) v
    from public.argument_supports s join public.arguments a on a.id = s.argument_id
    where a.initiative_id = p_initiative and a.hidden_at is null group by s.profile_id
  ), camps as (
    select profile_id, case when v > 0 then 'pro' when v < 0 then 'contra' end camp from lean
  ), sizes as (
    select count(*) filter (where camp = 'pro') n_pro, count(*) filter (where camp = 'contra') n_con from camps
  ), per_arg as (
    select a.id,
           count(c.profile_id) filter (where c.camp = 'pro') k_pro,
           count(c.profile_id) filter (where c.camp = 'contra') k_con
    from public.arguments a
    left join public.argument_supports s on s.argument_id = a.id
    left join camps c on c.profile_id = s.profile_id
    where a.initiative_id = p_initiative group by a.id
  )
  update public.arguments a
     set bridge_score = least(app.wilson_lower(p.k_pro, z.n_pro), app.wilson_lower(p.k_con, z.n_con))
    from per_arg p, sizes z where p.id = a.id
$$;

create or replace function app.respond_request(p_request uuid, p_decision public.resp_decision, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.responsibility_requests; days int;
begin
  select * into r from public.responsibility_requests where id = p_request;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from public.responsibilities where id = r.responsibility_id and holder_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_body), '')) < 5 then raise exception 'body_required'; end if;
  update public.responsibility_requests
     set status = 'answered', decision = p_decision, response_body = trim(p_body), responded_by = me, responded_at = now()
   where id = p_request;
  select round(avg(extract(epoch from responded_at - created_at) / 86400))::int into days
    from public.responsibility_requests where responsibility_id = r.responsibility_id and responded_at is not null;
  update public.responsibilities set avg_response_days = days where id = r.responsibility_id;
  if r.initiative_id is not null then
    update public.initiatives set
      phase = case when p_decision in ('accepted', 'partial') and phase = 'addressee' then 'implementation'::public.initiative_phase else phase end,
      outcome = case when p_decision = 'rejected' then 'rejected_addressee'::public.initiative_outcome else outcome end
    where id = r.initiative_id;
  end if;
  perform app.notify(r.author_id, 'request_answered', jsonb_build_object('request_id', r.id, 'initiative_id', r.initiative_id));
end $$;

create or replace function app.forward_request(p_request uuid, p_to uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.responsibility_requests;
begin
  select * into r from public.responsibility_requests where id = p_request;
  if not exists (select 1 from public.responsibilities where id = r.responsibility_id and holder_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.responsibility_requests set status = 'forwarded', forwarded_to_id = p_to, response_body = p_note,
         responded_by = me, responded_at = now() where id = p_request;
  insert into public.responsibility_requests (responsibility_id, initiative_id, group_id, listing_id, author_id, body)
  values (p_to, r.initiative_id, r.group_id, r.listing_id, r.author_id, r.body);
  perform app.notify(r.author_id, 'request_forwarded', jsonb_build_object('request_id', r.id));
end $$;

-- ───────────────────────── listings and contact ─────────────────────────
create or replace function app.save_listing(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); lid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
begin
  if gid is not null and not app.profile_has_group_permission(me, gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if lid is null then
    insert into public.listings (kind, owner_id, group_id, title, description, details_private, pay_mode, hourly_rate_cents,
                                 fixed_price_cents, swap_text, region_id, location_text, schedule_text, is_recurring, seats,
                                 seeking_allies, status)
    values ((p ->> 'kind')::public.listing_kind, me, gid, trim(p ->> 'title'), p ->> 'description', p ->> 'details_private',
            coalesce((p ->> 'pay_mode')::public.pay_mode, 'free'), nullif(p ->> 'hourly_rate_cents', '')::int,
            nullif(p ->> 'fixed_price_cents', '')::int, nullif(p ->> 'swap_text', ''), nullif(p ->> 'region_id', '')::uuid,
            nullif(p ->> 'location_text', ''), nullif(p ->> 'schedule_text', ''), coalesce((p ->> 'is_recurring')::boolean, false),
            nullif(p ->> 'seats', '')::int, coalesce((p ->> 'seeking_allies')::boolean, false),
            coalesce((p ->> 'status')::public.listing_status, 'active'))
    returning id into lid;
  else
    if not exists (select 1 from public.listings where id = lid and owner_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.listings set
      title = coalesce(trim(p ->> 'title'), title), description = coalesce(p ->> 'description', description),
      status = coalesce((p ->> 'status')::public.listing_status, status)
    where id = lid;
    delete from public.listing_tags where listing_id = lid and p ? 'tags';
  end if;
  if p ? 'tags' then
    insert into public.listing_tags (listing_id, tag_id)
      select lid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(p -> 'tags')))) on conflict do nothing;
  end if;
  return lid;
end $$;

create or replace function app.request_contact(p_listing uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); l public.listings; rid uuid;
begin
  select * into l from public.listings where id = p_listing and status = 'active';
  if not found then raise exception 'not_found'; end if;
  if l.owner_id = me then raise exception 'own_listing'; end if;
  insert into public.contact_requests (listing_id, from_profile_id, to_profile_id, message)
  values (p_listing, me, l.owner_id, trim(p_message)) returning id into rid;
  perform app.notify(l.owner_id, 'contact_request', jsonb_build_object('request_id', rid, 'listing_id', l.id, 'title', l.title));
  return rid;
end $$;

create or replace function app.decide_contact(p_request uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.contact_requests; conv uuid; l public.listings;
begin
  select * into r from public.contact_requests where id = p_request and status = 'pending';
  if not found or r.to_profile_id <> me then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.contact_requests set status = case when p_accept then 'accepted'::public.request_status else 'declined'::public.request_status end,
         decided_at = now() where id = p_request;
  select * into l from public.listings where id = r.listing_id;
  if p_accept then
    insert into public.conversations (contact_request_id, title) values (r.id, l.title) returning id into conv;
    insert into public.conversation_participants (conversation_id, profile_id) values (conv, r.from_profile_id), (conv, r.to_profile_id);
    insert into public.messages (conversation_id, sender_id, body) values (conv, r.from_profile_id, r.message);
  end if;
  perform app.notify(r.from_profile_id, case when p_accept then 'contact_accepted' else 'contact_declined' end,
                     jsonb_build_object('request_id', r.id, 'conversation_id', conv, 'title', l.title));
  return conv;
end $$;

create or replace function app.listing_private_details(p_listing uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.details_private from public.listings l where l.id = p_listing and (
    l.owner_id = app.uid() or exists (
      select 1 from public.contact_requests c where c.listing_id = l.id and c.status = 'accepted'
        and (c.from_profile_id = app.uid() or c.to_profile_id = app.uid())))
$$;

create or replace function app.is_participant(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = app.uid())
$$;

-- ───────────────────────── moderation ─────────────────────────
create sequence if not exists private.case_no_seq;

create or replace function app.create_report(p_type text, p_target uuid, p_rule public.report_rule, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); author uuid; body text; ctx text; reg uuid; rid uuid; cid uuid; case_no text; juror record;
begin
  case p_type
    when 'post' then
      select p.author_id, p.body, coalesce(i.region_id, p.region_id, g.region_id), parent.body
        into author, body, reg, ctx
        from public.posts p left join public.initiatives i on i.id = p.initiative_id left join public.groups g on g.id = p.group_id
        left join public.posts parent on parent.id = p.parent_id where p.id = p_target;
    when 'argument' then
      select a.author_id, a.body, i.region_id, i.title into author, body, reg, ctx
        from public.arguments a join public.initiatives i on i.id = a.initiative_id where a.id = p_target;
    when 'argument_reply' then
      select r.author_id, r.body, i.region_id, a.body into author, body, reg, ctx
        from public.argument_replies r join public.arguments a on a.id = r.argument_id
        join public.initiatives i on i.id = a.initiative_id where r.id = p_target;
    when 'listing' then
      select l.owner_id, l.title || coalesce(E'\n' || l.description, ''), l.region_id into author, body, reg
        from public.listings l where l.id = p_target;
    when 'message' then
      select m.sender_id, m.body into author, body from public.messages m
        where m.id = p_target and app.is_participant(m.conversation_id);
    else raise exception 'invalid_target';
  end case;
  if author is null then raise exception 'not_found'; end if;
  if author = me then raise exception 'own_content'; end if;
  if exists (select 1 from public.reports where reporter_id = me and target_type = p_type and target_id = p_target) then
    raise exception 'already_reported';
  end if;
  reg := coalesce(reg, (select home_region_id from public.profiles where id = me));
  insert into public.reports (reporter_id, target_type, target_id, target_author_id, rule, note)
  values (me, p_type, p_target, author, p_rule, nullif(trim(p_note), '')) returning id into rid;
  case_no := to_char(now(), 'YYYY') || '-' || lpad(nextval('private.case_no_seq')::text, 4, '0');
  insert into public.jury_cases (report_id, case_no, region_id, context_text, target_text)
  values (rid, case_no, reg, ctx, body) returning id into cid;
  -- Seven jurors by lot, preferring people from the same area.
  for juror in
    select p.id from public.profiles p
    where p.id not in (me, author) and app.profile_is_verified(p.id) and p.onboarded_at is not null
    order by (case when reg is not null and exists (
                select 1 from public.user_regions ur where ur.profile_id = p.id and ur.region_id = reg) then 0 else 1 end),
             random()
    limit 7
  loop
    insert into public.jury_seats (case_id, juror_id) values (cid, juror.id);
    perform app.notify(juror.id, 'jury_invite', jsonb_build_object('case_id', cid, 'case_no', case_no));
  end loop;
  update public.jury_cases set jury_size = greatest(1, (select count(*) from public.jury_seats where case_id = cid)) where id = cid;
  return case_no;
end $$;

create or replace function app.resolve_case(p_case uuid, p_status public.report_status) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.jury_cases; r public.reports;
begin
  select * into c from public.jury_cases where id = p_case for update;
  if c.status <> 'open' then return; end if;
  select * into r from public.reports where id = c.report_id;
  update public.jury_cases set status = p_status, decided_at = now() where id = p_case;
  update public.reports set status = p_status where id = r.id;
  if p_status = 'upheld' then
    case r.target_type
      when 'post' then update public.posts set hidden_at = now() where id = r.target_id;
      when 'argument' then update public.arguments set hidden_at = now() where id = r.target_id;
      when 'argument_reply' then update public.argument_replies set hidden_at = now() where id = r.target_id;
      when 'listing' then update public.listings set status = 'closed' where id = r.target_id;
      else null;
    end case;
  end if;
  perform app.notify(r.reporter_id, 'report_decided', jsonb_build_object('case_no', c.case_no, 'status', p_status, 'rule', r.rule));
  if p_status = 'upheld' then
    perform app.notify(r.target_author_id, 'content_hidden', jsonb_build_object('case_no', c.case_no, 'rule', r.rule));
  end if;
end $$;

create or replace function app.decide_jury(p_case uuid, p_choice public.jury_choice, p_reason text) returns public.report_status
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); c public.jury_cases; seats int; yes int; no int; need int;
begin
  update public.jury_seats set choice = p_choice, reason = nullif(trim(p_reason), ''), decided_at = now()
   where case_id = p_case and juror_id = me and choice is null and not declined;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.jury_cases where id = p_case;
  select count(*) filter (where not declined), count(*) filter (where choice = 'violation'),
         count(*) filter (where choice = 'no_violation')
    into seats, yes, no from public.jury_seats where case_id = p_case;
  need := seats / 2 + 1;
  if yes >= need then perform app.resolve_case(p_case, 'upheld');
  elsif no >= need then perform app.resolve_case(p_case, 'dismissed');
  end if;
  return (select status from public.jury_cases where id = p_case);
end $$;

create or replace function app.decline_jury(p_case uuid) returns void
language sql security definer set search_path = '' as $$
  update public.jury_seats set declined = true where case_id = p_case and juror_id = app.uid() and choice is null
$$;

-- After 7 days a case is decided by simple majority of the votes cast.
create or replace function app.jury_timeouts() returns void
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  for c in
    select jc.id, count(*) filter (where s.choice = 'violation') y, count(*) filter (where s.choice = 'no_violation') n
    from public.jury_cases jc left join public.jury_seats s on s.case_id = jc.id
    where jc.status = 'open' and jc.created_at < now() - interval '7 days' group by jc.id
  loop
    perform app.resolve_case(c.id, case when c.y > c.n then 'upheld'::public.report_status else 'dismissed'::public.report_status end);
  end loop;
end $$;

-- ───────────────────────── profile and onboarding ─────────────────────────
create or replace function app.set_home_region(p_region uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  update public.profiles set home_region_id = p_region, updated_at = now() where id = me;
  delete from public.user_regions where profile_id = me and source = 'residence';
  insert into public.user_regions (profile_id, region_id, source)
    select me, a, 'residence' from app.region_ancestors(p_region) a on conflict do nothing;
end $$;

create or replace function app.complete_onboarding(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); mode public.display_mode := coalesce((p ->> 'display_mode')::public.display_mode, 'alias');
        rel text;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  update public.profiles set
    display_mode = mode,
    real_name = coalesce(nullif(trim(p ->> 'real_name'), ''), real_name),
    alias = coalesce(nullif(trim(p ->> 'alias'), ''), alias),
    display_name = case when mode = 'real' then coalesce(nullif(trim(p ->> 'real_name'), ''), real_name, display_name)
                        else coalesce(nullif(trim(p ->> 'alias'), ''), alias::text, display_name) end,
    onboarded_at = coalesce(onboarded_at, now()), updated_at = now()
  where id = me;
  if nullif(p ->> 'region_id', '') is not null then perform app.set_home_region((p ->> 'region_id')::uuid); end if;
  foreach rel in array array['interest', 'offers', 'needs'] loop
    if p ? rel then
      delete from public.user_interests where profile_id = me and relation = rel;
      insert into public.user_interests (profile_id, tag_id, relation)
        select me, unnest(app.ensure_tags(array(select jsonb_array_elements_text(p -> rel)))), rel on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function app.set_profile_tags(p_relation text, p_tags text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if me is null or p_relation not in ('interest', 'offers', 'needs') then raise exception 'forbidden'; end if;
  delete from public.user_interests where profile_id = me and relation = p_relation;
  insert into public.user_interests (profile_id, tag_id, relation)
    select me, unnest(app.ensure_tags(p_tags)), p_relation on conflict do nothing;
end $$;

create or replace function app.save_responsibility(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid;
begin
  if rid is null then
    insert into public.responsibilities (holder_id, title, organization_name, description, region_id)
    values (me, trim(p ->> 'title'), nullif(trim(p ->> 'organization_name'), ''), trim(p ->> 'description'),
            nullif(p ->> 'region_id', '')::uuid)
    returning id into rid;
  else
    update public.responsibilities set title = trim(p ->> 'title'), organization_name = nullif(trim(p ->> 'organization_name'), ''),
           description = trim(p ->> 'description'), region_id = nullif(p ->> 'region_id', '')::uuid,
           -- changing an official title or organisation needs a new confirmation
           is_official = is_official and title = trim(p ->> 'title') and organization_name is not distinct from nullif(trim(p ->> 'organization_name'), '')
     where id = rid and holder_id = me;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
    delete from public.responsibility_tags where responsibility_id = rid;
  end if;
  insert into public.responsibility_tags (responsibility_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'))))) on conflict do nothing;
  return rid;
end $$;

-- ───────────────── server-only: sessions, official email, admin ─────────────────
create or replace function app.ensure_profile(p_auth_user uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; a text;
begin
  select id into pid from public.profiles where auth_user_id = p_auth_user;
  if pid is not null then return pid; end if;
  loop
    a := app.random_alias();
    exit when not exists (select 1 from public.profiles where alias = a);
  end loop;
  insert into public.profiles (auth_user_id, display_name, real_name, alias, display_mode)
  values (p_auth_user, a, nullif(trim(p_name), ''), a, 'alias')
  on conflict (auth_user_id) do nothing
  returning id into pid;
  if pid is null then select id into pid from public.profiles where auth_user_id = p_auth_user; end if;
  insert into public.user_settings (profile_id) values (pid) on conflict do nothing;
  return pid;
end $$;

create or replace function app.session_profile(p_auth_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'alias', p.alias, 'real_name', p.real_name,
    'display_mode', p.display_mode, 'avatar_seed', p.avatar_seed, 'onboarded', p.onboarded_at is not null,
    'verified', app.profile_is_verified(p.id), 'home_region_id', p.home_region_id,
    'home_region', (select jsonb_build_object('name', r.name, 'level', r.level) from public.regions r where r.id = p.home_region_id),
    'is_admin', exists (select 1 from public.server_admins a where a.profile_id = p.id),
    'settings', (select to_jsonb(s) - 'profile_id' from public.user_settings s where s.profile_id = p.id),
    'unread', (select count(*) from public.notifications n where n.profile_id = p.id and n.read_at is null))
  from public.profiles p where p.auth_user_id = p_auth_user
$$;

create or replace function app.start_official_verification(p_profile uuid, p_responsibility uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare dom text := lower(split_part(p_email, '@', 2)); matched text; token text;
begin
  if not exists (select 1 from public.responsibilities where id = p_responsibility and holder_id = p_profile) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select d.domain into matched from public.official_domains d
   where dom = d.domain or dom like '%.' || d.domain order by length(d.domain) desc limit 1;
  if matched is null then raise exception 'domain_not_official'; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.official_verifications (responsibility_id, email, token_hash, expires_at)
  values (p_responsibility, p_email, sha256(convert_to(token, 'UTF8')), now() + interval '2 days');
  return token;
end $$;

create or replace function app.confirm_official_verification(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v private.official_verifications; dom text;
begin
  select * into v from private.official_verifications
   where token_hash = sha256(convert_to(p_token, 'UTF8')) and confirmed_at is null and expires_at > now();
  if not found then raise exception 'invalid_token'; end if;
  update private.official_verifications set confirmed_at = now() where id = v.id;
  dom := lower(split_part(v.email, '@', 2));
  update public.responsibilities set is_official = true, official_domain = dom, official_verified_at = now()
   where id = v.responsibility_id;
  return v.responsibility_id;
end $$;

create or replace function app.admin_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profiles', (select count(*) from public.profiles where not is_demo),
    'demo_profiles', (select count(*) from public.profiles where is_demo),
    'groups', (select count(*) from public.groups),
    'initiatives', (select count(*) from public.initiatives),
    'listings', (select count(*) from public.listings),
    'open_ballots', (select count(*) from public.ballots where status = 'open'),
    'open_cases', (select count(*) from public.jury_cases where status = 'open'),
    'regions', (select count(*) from public.regions),
    'settings', (select jsonb_object_agg(key, value) from public.app_settings),
    'domains', (select coalesce(jsonb_agg(jsonb_build_object('domain', domain, 'label', label) order by domain), '[]') from public.official_domains),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name)), '[]')
               from public.server_admins a join public.profiles p on p.id = a.profile_id))
$$;

create or replace function app.admin_set_setting(p_key text, p_value jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
$$;

create or replace function app.admin_add_domain(p_domain text, p_label text) returns void
language sql security definer set search_path = '' as $$
  insert into public.official_domains (domain, label) values (lower(trim(p_domain)), trim(p_label))
  on conflict (domain) do update set label = excluded.label
$$;

create or replace function app.admin_remove_domain(p_domain text) returns void
language sql security definer set search_path = '' as $$ delete from public.official_domains where domain = lower(trim(p_domain)) $$;

create or replace function app.admin_purge_demo() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.groups where created_by in (select id from public.profiles where is_demo);
  delete from public.profiles where is_demo;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.admin_grant(p_profile uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_admin then insert into public.server_admins (profile_id) values (p_profile) on conflict do nothing;
  else delete from public.server_admins where profile_id = p_profile; end if;
end $$;

-- ───────────────────────── triggers ─────────────────────────
create or replace function app.trg_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end; r record;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  case tg_table_name
    when 'initiative_supports' then
      update public.initiatives set support_count = support_count + d where id = r.initiative_id;
    when 'arguments' then
      update public.initiatives set argument_count = argument_count + d where id = r.initiative_id;
      if tg_op = 'INSERT' then perform app.check_debate(r.initiative_id); end if;
    when 'argument_supports' then
      update public.arguments set support_count = support_count + d where id = r.argument_id;
      perform app.recompute_bridge((select initiative_id from public.arguments where id = r.argument_id));
    when 'argument_replies' then
      update public.arguments set reply_count = reply_count + d where id = r.argument_id;
      if tg_op = 'INSERT' then perform app.check_debate((select initiative_id from public.arguments where id = r.argument_id)); end if;
    when 'posts' then
      if r.parent_id is not null then update public.posts set reply_count = reply_count + d where id = r.parent_id; end if;
      if r.initiative_id is not null and r.parent_id is null then
        update public.initiatives set thread_count = thread_count + d where id = r.initiative_id;
      end if;
      if tg_op = 'INSERT' and r.initiative_id is not null then perform app.check_debate(r.initiative_id); end if;
    when 'group_members' then
      update public.groups set member_count = member_count + d where id = r.group_id;
    when 'listing_allies' then
      update public.listings set ally_count = ally_count + d where id = r.listing_id;
    when 'endorsements' then
      update public.profiles set helped_count = helped_count + d where id = r.to_profile_id;
  end case;
  return null;
end $$;

create trigger counts after insert or delete on public.initiative_supports for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.arguments for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.argument_supports for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.argument_replies for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.posts for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.group_members for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.listing_allies for each row execute function app.trg_counts();
create trigger counts after insert or delete on public.endorsements for each row execute function app.trg_counts();

create or replace function app.trg_post_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts set score = (select coalesce(sum(value), 0) from public.post_votes where post_id = coalesce(new.post_id, old.post_id))
   where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
create trigger score after insert or update or delete on public.post_votes for each row execute function app.trg_post_vote();

create or replace function app.trg_initiative_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (old.title, old.summary, old.body, old.body_easy, old.addressee_text, old.cost_estimate_cents)
     is distinct from (new.title, new.summary, new.body, new.body_easy, new.addressee_text, new.cost_estimate_cents) then
    insert into public.initiative_revisions (initiative_id, editor_id, snapshot)
    values (new.id, app.uid(), jsonb_build_object('title', new.title, 'summary', new.summary, 'body', new.body,
            'body_easy', new.body_easy, 'addressee_text', new.addressee_text, 'cost_estimate_cents', new.cost_estimate_cents));
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger revision before update on public.initiatives for each row execute function app.trg_initiative_revision();

create or replace function app.trg_initiative_first_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.initiative_revisions (initiative_id, editor_id, note, snapshot)
  values (new.id, new.created_by, 'created', jsonb_build_object('title', new.title, 'summary', new.summary, 'body', new.body,
          'body_easy', new.body_easy, 'addressee_text', new.addressee_text, 'cost_estimate_cents', new.cost_estimate_cents));
  return null;
end $$;
create trigger first_revision after insert on public.initiatives for each row execute function app.trg_initiative_first_revision();

create or replace function app.trg_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
   where conversation_id = new.conversation_id and profile_id = new.sender_id;
  insert into public.notifications (profile_id, kind, payload)
    select cp.profile_id, 'message', jsonb_build_object('conversation_id', new.conversation_id)
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.profile_id <> new.sender_id
      and not exists (select 1 from public.notifications n where n.profile_id = cp.profile_id and n.kind = 'message'
                      and n.read_at is null and n.payload ->> 'conversation_id' = new.conversation_id::text);
  return null;
end $$;
create trigger after_message after insert on public.messages for each row execute function app.trg_message();

create or replace function app.trg_post_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent public.posts;
begin
  if new.parent_id is null then return null; end if;
  select * into parent from public.posts where id = new.parent_id;
  if parent.author_id <> new.author_id then
    perform app.notify(parent.author_id, 'post_reply', jsonb_build_object('post_id', parent.id, 'group_id', parent.group_id,
                       'initiative_id', parent.initiative_id));
  end if;
  return null;
end $$;
create trigger after_reply after insert on public.posts for each row execute function app.trg_post_reply();

create or replace function app.trg_request_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify(r.holder_id, 'responsibility_request', jsonb_build_object('request_id', new.id))
    from public.responsibilities r where r.id = new.responsibility_id;
  return null;
end $$;
create trigger after_request after insert on public.responsibility_requests for each row execute function app.trg_request_created();

-- Federation outbox: public objects are queued for delivery. Nothing reads the
-- queue until a federation worker exists.
create or replace function app.trg_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if r.origin_instance_id is not null then return null; end if;
  insert into public.federation_outbox (object_type, object_id, activity)
  values (tg_table_name, r.id, case tg_op when 'INSERT' then 'Create' when 'UPDATE' then 'Update' else 'Delete' end);
  return null;
end $$;
create trigger outbox after insert or update or delete on public.groups for each row execute function app.trg_outbox();
create trigger outbox after insert or update or delete on public.initiatives for each row execute function app.trg_outbox();
create trigger outbox after insert or delete on public.arguments for each row execute function app.trg_outbox();
create trigger outbox after insert or delete on public.listings for each row execute function app.trg_outbox();

-- ───────────────────────── privileges ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated, public;
revoke all on schema private from anon, authenticated, public;
revoke execute on all functions in schema app from public;
grant usage on schema public, app to anon, authenticated, hivevoice_server;

-- Helpers used inside policies and for reading
grant execute on function app.claims(), app.uid(), app.setting(text), app.verification_mode(), app.profile_is_verified(uuid),
  app.is_verified(), app.group_role(uuid), app.can_read_group(uuid), app.has_group_permission(uuid, public.group_permission),
  app.profile_has_group_permission(uuid, uuid, public.group_permission), app.is_participant(uuid), app.region_ancestors(uuid),
  app.ballot_turnout(uuid), app.can_read_ballot(uuid), app.listing_private_details(uuid), app.wilson_lower(bigint, bigint),
  app.slugify(text)
  to anon, authenticated, hivevoice_server;

-- User actions (each checks app.uid() itself)
grant execute on function app.require_verified(), app.create_group(jsonb), app.join_group(uuid, text),
  app.decide_join_request(uuid, boolean, public.group_role), app.set_member_role(uuid, uuid, public.group_role),
  app.remove_member(uuid, uuid), app.propose_goal(jsonb), app.start_initiative_ballot(uuid, text, int, int),
  app.create_initiative(jsonb), app.respond_request(uuid, public.resp_decision, text), app.forward_request(uuid, uuid, text),
  app.save_listing(jsonb), app.request_contact(uuid, text), app.decide_contact(uuid, boolean),
  app.create_report(text, uuid, public.report_rule, text), app.decide_jury(uuid, public.jury_choice, text),
  app.decline_jury(uuid), app.set_home_region(uuid), app.complete_onboarding(jsonb), app.set_profile_tags(text, text[]),
  app.save_responsibility(jsonb)
  to authenticated, hivevoice_server;

-- Trusted server functions
grant execute on function app.cast_vote(uuid, uuid, bytea, text), app.close_ballot(uuid), app.tick(),
  app.ensure_profile(uuid, text), app.session_profile(uuid), app.start_official_verification(uuid, uuid, text),
  app.confirm_official_verification(text), app.admin_overview(), app.admin_set_setting(text, jsonb),
  app.admin_add_domain(text, text), app.admin_remove_domain(text), app.admin_purge_demo(), app.admin_grant(uuid, boolean)
  to hivevoice_server;
grant anon, authenticated to hivevoice_server;

-- Reading
grant select on public.regions, public.postal_codes, public.tags, public.official_domains, public.app_settings,
  public.instances, public.user_interests, public.endorsements, public.responsibility_tags,
  public.groups, public.group_tags, public.group_members, public.group_role_permissions,
  public.goals, public.goal_owners, public.tasks, public.task_assignees, public.files, public.file_versions,
  public.initiatives, public.initiative_authors, public.initiative_tags, public.initiative_revisions,
  public.responsibility_requests, public.posts, public.arguments, public.argument_replies, public.ballots,
  public.listing_tags, public.listing_allies, public.funding_campaigns
  to anon, authenticated;
grant select (id, display_mode, display_name, alias, avatar_seed, bio, headline, home_region_id, is_verified,
              verified_at, onboarded_at, helped_count, created_at, actor_uri, origin_instance_id, is_demo) on public.profiles to anon, authenticated;
grant select (id, holder_id, title, organization_name, description, region_id, is_official, official_domain,
              official_verified_at, avg_response_days, created_at) on public.responsibilities to anon, authenticated;
grant select (id, uri, origin_instance_id, kind, owner_id, group_id, goal_id, title, description, cover_seed, pay_mode,
              hourly_rate_cents, fixed_price_cents, swap_text, region_id, location_text, schedule_text, is_recurring, seats,
              seeking_allies, ally_count, status, created_at) on public.listings to anon, authenticated;
grant select on public.user_regions, public.user_settings, public.follows, public.initiative_supports, public.post_votes,
  public.argument_supports, public.ballot_participation, public.contact_requests, public.conversations,
  public.conversation_participants, public.messages, public.reports, public.jury_cases, public.jury_seats, public.notes,
  public.notifications, public.change_requests, public.pledges, public.group_join_requests, public.server_admins
  to authenticated;

-- Writing (always narrowed further by policies)
grant update (display_mode, display_name, real_name, alias, bio, headline, avatar_seed) on public.profiles to authenticated;
grant insert, update, delete on public.user_settings, public.follows, public.notes, public.endorsements,
  public.initiative_supports, public.post_votes, public.argument_supports, public.listing_allies, public.posts,
  public.arguments, public.argument_replies, public.messages, public.tasks, public.task_assignees, public.goal_owners
  to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications, public.responsibilities, public.listings to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
grant update (title, summary, body, body_easy, addressee_responsibility_id, addressee_text, cost_estimate_cents, published_at)
  on public.initiatives to authenticated;
grant insert, delete on public.initiative_tags, public.group_tags to authenticated;
grant update (name, summary, description, kind, visibility, join_policy, region_id, mod_tasks, mod_official, archived_at)
  on public.groups to authenticated;
grant update (allowed) on public.group_role_permissions to authenticated;
grant update (focus) on public.group_members to authenticated;
grant update (title, description, timeline, due_date, done, position, status) on public.goals to authenticated;
grant update (status) on public.contact_requests to authenticated;
grant update (status) on public.group_join_requests to authenticated;
grant update (title, description, location_text, schedule_text, status, seats, pay_mode, hourly_rate_cents,
              fixed_price_cents, swap_text, details_private, seeking_allies, region_id, is_recurring) on public.listings to authenticated;

-- ───────────────────────── row level security ─────────────────────────
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data: readable by everyone
create policy read_all on public.regions for select using (true);
create policy read_all on public.postal_codes for select using (true);
create policy read_all on public.tags for select using (true);
create policy read_all on public.official_domains for select using (true);
create policy read_all on public.app_settings for select using (true);
create policy read_all on public.instances for select using (true);

-- Profiles
create policy read_all on public.profiles for select using (true);
create policy update_own on public.profiles for update to authenticated using (id = app.uid()) with check (id = app.uid());
create policy own on public.user_regions for select to authenticated using (profile_id = app.uid());
create policy own on public.user_settings for all to authenticated using (profile_id = app.uid()) with check (profile_id = app.uid());
create policy read_all on public.user_interests for select using (true);
create policy read_all on public.endorsements for select using (true);
create policy write_own on public.endorsements for insert to authenticated with check (from_profile_id = app.uid() and app.is_verified());
create policy delete_own on public.endorsements for delete to authenticated using (from_profile_id = app.uid());
create policy own on public.follows for all to authenticated using (follower_id = app.uid()) with check (follower_id = app.uid());
create policy own on public.notes for all to authenticated using (profile_id = app.uid()) with check (profile_id = app.uid());
create policy own_read on public.notifications for select to authenticated using (profile_id = app.uid());
create policy own_update on public.notifications for update to authenticated using (profile_id = app.uid());
create policy own_delete on public.notifications for delete to authenticated using (profile_id = app.uid());
create policy own on public.server_admins for select to authenticated using (profile_id = app.uid());

-- Responsibilities
create policy read_all on public.responsibilities for select using (true);
create policy delete_own on public.responsibilities for delete to authenticated using (holder_id = app.uid());
create policy read_all on public.responsibility_tags for select using (true);
create policy read_all on public.responsibility_requests for select using (true);

-- Groups
create policy read on public.groups for select using (visibility = 'public' or app.group_role(id) is not null);
create policy admin_update on public.groups for update to authenticated using (app.group_role(id) = 'admin');
create policy read on public.group_tags for select using (app.can_read_group(group_id));
create policy admin_write on public.group_tags for insert to authenticated with check (app.group_role(group_id) = 'admin');
create policy admin_delete on public.group_tags for delete to authenticated using (app.group_role(group_id) = 'admin');
create policy read on public.group_members for select using (app.can_read_group(group_id));
create policy own_focus on public.group_members for update to authenticated using (profile_id = app.uid());
create policy read on public.group_role_permissions for select using (app.can_read_group(group_id));
create policy admin_update on public.group_role_permissions for update to authenticated
  using (app.group_role(group_id) = 'admin') with check (app.group_role(group_id) = 'admin');
create policy read on public.group_join_requests for select to authenticated
  using (profile_id = app.uid() or app.has_group_permission(group_id, 'manage_members'));

-- Goals and tasks
create policy read on public.goals for select using (app.can_read_group(group_id));
create policy edit on public.goals for update to authenticated using (
  app.group_role(group_id) in ('admin', 'maintainer')
  or exists (select 1 from public.goal_owners o where o.goal_id = coalesce(parent_goal_id, id) and o.profile_id = app.uid()));
create policy read on public.goal_owners for select using (true);
create policy edit on public.goal_owners for all to authenticated
  using (app.group_role((select group_id from public.goals where id = goal_id)) in ('admin', 'maintainer'))
  with check (app.group_role((select group_id from public.goals where id = goal_id)) in ('admin', 'maintainer'));
create policy read on public.tasks for select using (app.can_read_group(group_id));
create policy edit on public.tasks for all to authenticated
  using (app.has_group_permission(group_id, 'edit_tasks'))
  with check (app.has_group_permission(group_id, 'edit_tasks'));
create policy read on public.task_assignees for select using (true);
create policy edit on public.task_assignees for all to authenticated
  using (app.has_group_permission((select group_id from public.tasks where id = task_id), 'edit_tasks'))
  with check (app.has_group_permission((select group_id from public.tasks where id = task_id), 'edit_tasks'));
create policy read on public.files for select using (app.can_read_group(group_id));
create policy read on public.file_versions for select using (app.can_read_group((select group_id from public.files where id = file_id)));
create policy read on public.change_requests for select to authenticated
  using (app.can_read_group((select group_id from public.files where id = file_id)));

-- Initiatives
create policy read on public.initiatives for select using (
  published_at is not null or exists (select 1 from public.initiative_authors a where a.initiative_id = id and a.profile_id = app.uid()));
create policy authors_update on public.initiatives for update to authenticated using (
  exists (select 1 from public.initiative_authors a where a.initiative_id = id and a.profile_id = app.uid()));
create policy read_all on public.initiative_authors for select using (true);
create policy read_all on public.initiative_tags for select using (true);
create policy authors_write on public.initiative_tags for insert to authenticated with check (
  exists (select 1 from public.initiative_authors a where a.initiative_id = initiative_tags.initiative_id and a.profile_id = app.uid()));
create policy authors_delete on public.initiative_tags for delete to authenticated using (
  exists (select 1 from public.initiative_authors a where a.initiative_id = initiative_tags.initiative_id and a.profile_id = app.uid()));
create policy own on public.initiative_supports for select to authenticated using (profile_id = app.uid());
create policy support on public.initiative_supports for insert to authenticated with check (profile_id = app.uid() and app.is_verified());
create policy unsupport on public.initiative_supports for delete to authenticated using (profile_id = app.uid());
create policy read_all on public.initiative_revisions for select using (true);

-- Posts (threads, group conversation, marketplace)
create policy read on public.posts for select using (
  (hidden_at is null or author_id = app.uid())
  and (group_id is null or app.can_read_group(group_id)));
create policy write on public.posts for insert to authenticated with check (
  author_id = app.uid() and app.is_verified()
  and (group_id is null or app.has_group_permission(group_id, 'post'))
  and hidden_at is null and score = 0 and reply_count = 0 and not is_pinned);
create policy edit_own on public.posts for update to authenticated using (author_id = app.uid()) with check (author_id = app.uid());
create policy delete_own on public.posts for delete to authenticated using (author_id = app.uid()
  or (group_id is not null and app.group_role(group_id) in ('admin', 'maintainer')));
create policy own on public.post_votes for all to authenticated
  using (profile_id = app.uid()) with check (profile_id = app.uid() and app.is_verified());

-- Arguments
create policy read on public.arguments for select using (hidden_at is null or author_id = app.uid());
create policy write on public.arguments for insert to authenticated with check (
  author_id = app.uid() and app.is_verified() and support_count = 0 and reply_count = 0 and bridge_score = 0 and hidden_at is null
  and exists (select 1 from public.initiatives i where i.id = initiative_id and i.published_at is not null));
create policy edit_own on public.arguments for update to authenticated using (author_id = app.uid()) with check (author_id = app.uid());
create policy delete_own on public.arguments for delete to authenticated using (author_id = app.uid());
create policy own on public.argument_supports for select to authenticated using (profile_id = app.uid());
create policy support on public.argument_supports for insert to authenticated with check (profile_id = app.uid() and app.is_verified());
create policy unsupport on public.argument_supports for delete to authenticated using (profile_id = app.uid());
create policy read on public.argument_replies for select using (hidden_at is null or author_id = app.uid());
create policy write on public.argument_replies for insert to authenticated with check (author_id = app.uid() and app.is_verified() and hidden_at is null);
create policy delete_own on public.argument_replies for delete to authenticated using (author_id = app.uid());

-- Ballots
create policy read on public.ballots for select using (subject_type = 'initiative' or app.can_read_group(group_id));
create policy own on public.ballot_participation for select to authenticated using (profile_id = app.uid());

-- Listings and contact
create policy read on public.listings for select using (status in ('active', 'paused', 'closed') or owner_id = app.uid());
create policy edit_own on public.listings for update to authenticated using (owner_id = app.uid()) with check (owner_id = app.uid());
create policy delete_own on public.listings for delete to authenticated using (owner_id = app.uid());
create policy read_all on public.listing_tags for select using (true);
create policy read_all on public.listing_allies for select using (true);
create policy ally on public.listing_allies for insert to authenticated with check (profile_id = app.uid() and app.is_verified());
create policy unally on public.listing_allies for delete to authenticated using (profile_id = app.uid());
create policy involved on public.contact_requests for select to authenticated
  using (from_profile_id = app.uid() or to_profile_id = app.uid());
create policy withdraw on public.contact_requests for update to authenticated
  using (from_profile_id = app.uid() and status = 'pending') with check (status = 'withdrawn');

-- Conversations
create policy participant on public.conversations for select to authenticated using (app.is_participant(id));
create policy participant on public.conversation_participants for select to authenticated using (app.is_participant(conversation_id));
create policy own_read_marker on public.conversation_participants for update to authenticated using (profile_id = app.uid());
create policy participant on public.messages for select to authenticated using (app.is_participant(conversation_id));
create policy send on public.messages for insert to authenticated with check (sender_id = app.uid() and app.is_participant(conversation_id));

-- Funding (read only until the module ships)
create policy read on public.funding_campaigns for select using (group_id is null or app.can_read_group(group_id));
create policy own on public.pledges for select to authenticated using (profile_id = app.uid());

-- Moderation
create policy own on public.reports for select to authenticated using (reporter_id = app.uid() or target_author_id = app.uid());
create policy juror_or_reporter on public.jury_cases for select to authenticated using (
  exists (select 1 from public.jury_seats s where s.case_id = id and s.juror_id = app.uid())
  or exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = app.uid()));
create policy own on public.jury_seats for select to authenticated using (juror_id = app.uid());

-- No client access at all
-- public.federation_outbox: RLS on, no policies.
