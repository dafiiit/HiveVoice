-- Kalender und Dienste (F01, F02): dates of groups and of single people, answers per date (also per role: "2. Geige
-- fehlt"), reminders, an iCal feed per person and public dates in Gemeinschaft. A duty (Dienst) is a recurring date of a
-- group with a rotation: who is on is worked out from the order, can be taken over, handed on ("Vertretung gesucht")
-- and ticked off, so "wer war zuletzt dran" is always known.
--
-- A repeating date is one row; each date of it ("occurrence") is computed (app.event_times) and named by its start.
-- Answers, cancellations and changes of a single date hang on (event_id, occurs_at).
-- The fields map onto an ActivityPub `Event` (name, content, startTime, endTime, location, attributedTo, audience) and
-- onto iCal VEVENT, so federation can publish public dates later without a new model.

alter table public.groups drop constraint if exists groups_tools_known;
alter table public.groups add constraint groups_tools_known
  check (tools <@ array['goals', 'links', 'collection', 'needs', 'tasks', 'expenses', 'calendar']::text[]);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  -- A group's date (members see it), or a personal one (null): the owner and the people invited see it.
  group_id uuid references public.groups(id) on delete cascade,
  -- A course or meeting from the market ("Kurse & Treffen") that this date belongs to.
  listing_id uuid references public.listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'event' check (kind in ('event', 'duty')),
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 4000),
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 0 and 20160),
  all_day boolean not null default false,
  -- Repeats are counted in this time zone, so a weekly date stays at 19:00 across summer time.
  tz text not null default 'Europe/Berlin' check (char_length(tz) between 1 and 64),
  place text check (char_length(place) <= 200),
  region_id uuid references public.regions(id) on delete set null,
  online_url text check (online_url ~ '^https?://' and char_length(online_url) <= 500),
  -- private: the group's members (group date) or the owner and invited people (personal date). public: everybody,
  -- listed in Gemeinschaft → Termine.
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  recur text not null default 'none' check (recur in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  recur_until date,
  rsvp boolean not null default true,
  capacity int check (capacity between 1 and 100000),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'event' or group_id is not null)
);
create index on public.events (group_id, starts_at);
create index on public.events (owner_id);
create index on public.events (listing_id) where listing_id is not null;
create index on public.events (starts_at) where visibility = 'public' and cancelled_at is null;

-- Roles a date needs ("2 Geigen, 1 Bratsche"): answers may name one, the date shows what is missing.
create table public.event_roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  needed int not null default 1 check (needed between 1 and 1000),
  position int not null default 0
);
create index on public.event_roles (event_id);

-- People invited to a personal date (they see it and may answer).
create table public.event_guests (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index on public.event_guests (profile_id);

-- Zu- und Absagen, per date of a series.
create table public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  occurs_at timestamptz not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('yes', 'maybe', 'no')),
  role_id uuid references public.event_roles(id) on delete set null,
  note text check (char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  primary key (event_id, occurs_at, profile_id)
);
create index on public.event_rsvps (profile_id, occurs_at);

-- The order of a duty: the n-th date is done by person n mod count.
create table public.duty_rotation (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position int not null,
  primary key (event_id, profile_id)
);

-- Changes of one date: cancelled, someone else on duty, cover wanted, done.
create table public.event_changes (
  event_id uuid not null references public.events(id) on delete cascade,
  occurs_at timestamptz not null,
  cancelled boolean not null default false,
  assignee_id uuid references public.profiles(id) on delete set null,
  cover_wanted boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  note text check (char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  primary key (event_id, occurs_at)
);

-- Per person: which reminders, and the key of the iCal feed (a secret address, can be renewed).
create table public.calendar_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  remind_day boolean not null default true,
  remind_hour boolean not null default true,
  feed_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

create table private.event_reminders_sent (
  event_id uuid not null references public.events(id) on delete cascade,
  occurs_at timestamptz not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, occurs_at, profile_id, kind)
);

-- ───────────────────── who may see and change a date ─────────────────────
create or replace function app.can_read_event_as(p_event uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e where e.id = p_event and (
      e.visibility = 'public'
      or e.owner_id = p_profile
      or (e.group_id is not null and exists (select 1 from public.group_members m where m.group_id = e.group_id and m.profile_id = p_profile))
      or exists (select 1 from public.event_guests g where g.event_id = e.id and g.profile_id = p_profile)))
$$;

create or replace function app.can_read_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_read_event_as(p_event, app.uid())
$$;

-- The owner, and the admins and maintainers of its group.
create or replace function app.can_edit_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and (
    e.owner_id = app.uid() or (e.group_id is not null and app.group_role(e.group_id) in ('admin', 'maintainer'))))
$$;

alter table public.events enable row level security;
alter table public.event_roles enable row level security;
alter table public.event_guests enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.duty_rotation enable row level security;
alter table public.event_changes enable row level security;
alter table public.calendar_prefs enable row level security;
create policy read on public.events for select using (app.can_read_event(id));
create policy read on public.event_roles for select using (app.can_read_event(event_id));
create policy read on public.event_guests for select using (app.can_read_event(event_id));
create policy read on public.event_rsvps for select using (app.can_read_event(event_id));
create policy read on public.duty_rotation for select using (app.can_read_event(event_id));
create policy read on public.event_changes for select using (app.can_read_event(event_id));
create policy read on public.calendar_prefs for select to authenticated using (profile_id = app.uid());
grant select on public.events, public.event_roles, public.event_rsvps, public.event_changes to anon, authenticated;
grant select on public.event_guests, public.duty_rotation, public.calendar_prefs to authenticated;
grant execute on function app.can_read_event(uuid), app.can_edit_event(uuid) to anon, authenticated;

-- ───────────────────── the dates of a series ─────────────────────
-- Every date of `e` that overlaps [p_from, p_to), with its number in the series (0 for the first; duties use it for the order).
create or replace function app.event_times(e public.events, p_from timestamptz, p_to timestamptz)
returns table (occurs_at timestamptz, n int)
language sql stable set search_path = '' as $$
  with s as (
    select case e.recur when 'daily' then 1 when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 31 else 1 end as lo,
           case e.recur when 'daily' then 1 when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 28 else 1 end as hi
  ), k as (
    select greatest(0, floor(extract(epoch from (p_from - e.starts_at)) / 86400.0 / s.lo)::int - 1) as k_lo,
           greatest(0, ceil(extract(epoch from (p_to - e.starts_at)) / 86400.0 / s.hi)::int + 1) as k_hi, s.hi
    from s
  ), x as (
    select ((e.starts_at at time zone e.tz) + case e.recur when 'monthly' then make_interval(months => g) else make_interval(days => g * k.hi) end) at time zone e.tz as at, g
    from k, generate_series(case when e.recur = 'none' then 0 else k.k_lo end,
                            case when e.recur = 'none' then 0 else least(k.k_hi, k.k_lo + 1000) end) g
  )
  select x.at, x.g from x
  where x.at + make_interval(mins => greatest(e.duration_minutes, 1)) > p_from and x.at < p_to
    and (e.recur_until is null or (x.at at time zone e.tz)::date <= e.recur_until)
$$;
grant execute on function app.event_times(public.events, timestamptz, timestamptz) to anon, authenticated, hivevoice_server;

-- Whether `p_at` is one of the dates of the event (answers and changes only for real dates).
create or replace function app.is_event_time(e public.events, p_at timestamptz) returns int
language sql stable set search_path = '' as $$
  select t.n from app.event_times(e, p_at - interval '1 second', p_at + interval '1 second') t where t.occurs_at = p_at limit 1
$$;

-- Who is on duty for date number n (the rotation, unless someone took it over).
create or replace function app.duty_assignee(p_event uuid, p_at timestamptz, p_n int) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.assignee_id from public.event_changes c where c.event_id = p_event and c.occurs_at = p_at and c.assignee_id is not null),
    (select r.profile_id from public.duty_rotation r where r.event_id = p_event order by r.position, r.profile_id
       offset (p_n % greatest(1, (select count(*) from public.duty_rotation r2 where r2.event_id = p_event)::int)) limit 1))
$$;
grant execute on function app.duty_assignee(uuid, timestamptz, int) to anon, authenticated, hivevoice_server;

-- ───────────────────── reading a calendar ─────────────────────
-- p_scope: 'mine' (my own dates, those I am invited to, my groups' dates where the calendar is on, public ones I said yes or
-- maybe to), 'group' (one group's dates), 'listing' (the dates of one course), 'public' (everybody's public dates).
-- Runs as the viewer (row level security applies).
create or replace function app.calendar(p_from timestamptz, p_to timestamptz, p_scope text, p_target uuid default null)
returns table (
  event_id uuid, occurs_at timestamptz, ends_at timestamptz, n int, kind text, title text, place text, online_url text,
  all_day boolean, visibility text, recur text, group_id uuid, group_slug text, group_name text, listing_id uuid,
  region_id uuid, region_name text, owner_id uuid, cancelled boolean, my_status text, yes_count int, maybe_count int,
  capacity int, rsvp boolean, missing int, assignee_id uuid, assignee_name text, cover_wanted boolean, done boolean)
language sql stable set search_path = '' as $$
  with occ as (
    select e.*, t.occurs_at as at, t.n as num from public.events e cross join lateral app.event_times(e, p_from, p_to) t
    where e.starts_at < p_to and (e.recur <> 'none' or e.starts_at + make_interval(mins => greatest(e.duration_minutes, 1)) > p_from)
      and (e.recur_until is null or e.recur_until >= (p_from at time zone e.tz)::date)
      and case p_scope
        when 'group' then e.group_id = p_target
        when 'listing' then e.listing_id = p_target
        when 'public' then e.visibility = 'public' and e.cancelled_at is null and (p_target is null or e.region_id = p_target)
        else (e.owner_id = app.uid()
              or exists (select 1 from public.event_guests g where g.event_id = e.id and g.profile_id = app.uid())
              or (e.group_id is not null and exists (select 1 from public.group_members m join public.groups gr on gr.id = m.group_id
                    where m.group_id = e.group_id and m.profile_id = app.uid() and 'calendar' = any (gr.tools)))
              or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.profile_id = app.uid() and r.status in ('yes', 'maybe')))
      end
  )
  select o.id, o.at, o.at + make_interval(mins => o.duration_minutes), o.num, o.kind, o.title, o.place, o.online_url,
         o.all_day, o.visibility, o.recur, o.group_id, gr.slug::text, gr.name, o.listing_id, o.region_id, rg.name, o.owner_id,
         (o.cancelled_at is not null or coalesce(c.cancelled, false)),
         (select r.status from public.event_rsvps r where r.event_id = o.id and r.occurs_at = o.at and r.profile_id = app.uid()),
         (select count(*)::int from public.event_rsvps r where r.event_id = o.id and r.occurs_at = o.at and r.status = 'yes'),
         (select count(*)::int from public.event_rsvps r where r.event_id = o.id and r.occurs_at = o.at and r.status = 'maybe'),
         o.capacity, o.rsvp,
         (select coalesce(sum(greatest(0, ro.needed - (select count(*) from public.event_rsvps r where r.event_id = o.id and r.occurs_at = o.at
                  and r.status = 'yes' and r.role_id = ro.id))), 0)::int from public.event_roles ro where ro.event_id = o.id),
         a.id, a.display_name, coalesce(c.cover_wanted, false), c.done_at is not null
  from occ o
  left join public.groups gr on gr.id = o.group_id
  left join public.regions rg on rg.id = o.region_id
  left join public.event_changes c on c.event_id = o.id and c.occurs_at = o.at
  left join public.profiles a on o.kind = 'duty' and a.id = app.duty_assignee(o.id, o.at, o.num)
  where p_scope <> 'mine' or o.kind <> 'event' or not exists (
    select 1 from public.event_rsvps r where r.event_id = o.id and r.occurs_at = o.at and r.profile_id = app.uid() and r.status = 'no')
    or o.owner_id = app.uid()
  order by o.at, o.title
  limit 500
$$;
grant execute on function app.calendar(timestamptz, timestamptz, text, uuid) to anon, authenticated, hivevoice_server;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values ('event', 1, 30, 100, 24)
on conflict (action) do nothing;

-- ───────────────────── writing a date ─────────────────────
-- p: {id?, group_id?, listing_id?, kind, title, description, starts_at, duration_minutes, all_day, tz, place, region_id,
--     online_url, visibility, recur, recur_until, rsvp, capacity, roles: [{id?, name, needed}], rotation: [profile id],
--     guests: [profile id]}
create or replace function app.save_event(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.uid(); eid uuid := nullif(p ->> 'id', '')::uuid; old public.events; gid uuid; lid uuid; role public.group_role;
  g public.groups; k text := coalesce(nullif(p ->> 'kind', ''), 'event'); vis text := coalesce(nullif(p ->> 'visibility', ''), 'private');
  ttl text := btrim(coalesce(p ->> 'title', '')); rec text := coalesce(nullif(p ->> 'recur', ''), 'none');
  starts timestamptz := nullif(p ->> 'starts_at', '')::timestamptz; dur int := coalesce(nullif(p ->> 'duration_minutes', '')::int, 60);
  url text := nullif(btrim(coalesce(p ->> 'online_url', '')), ''); x jsonb; i int := 0; pid uuid; keep uuid[] := '{}';
  my_name text; is_new boolean := eid is null; n_rot int;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if is_new then
    gid := nullif(p ->> 'group_id', '')::uuid;
    lid := nullif(p ->> 'listing_id', '')::uuid;
  else
    select * into old from public.events where id = eid;
    if not found then raise exception 'not_found'; end if;
    if not app.can_edit_event(eid) then raise exception 'forbidden' using errcode = '42501'; end if;
    gid := old.group_id; lid := old.listing_id; k := old.kind;
  end if;
  if gid is not null then
    select * into g from public.groups where id = gid;
    role := app.group_role(gid);
    if g.id is null or role is null or role = 'guest' or not ('calendar' = any (g.tools)) then raise exception 'forbidden' using errcode = '42501'; end if;
    -- A group's date goes public only by its admins and maintainers, or in a public group by those who may post.
    if vis = 'public' and not (role in ('admin', 'maintainer') or (g.visibility = 'public' and app.has_group_permission(gid, 'post'))) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if lid is not null and not exists (select 1 from public.listings l where l.id = lid and l.owner_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if lid is not null then vis := 'public'; end if;
  if is_new then perform app.check_limit('event'); end if;

  if k not in ('event', 'duty') or (k = 'duty' and gid is null) or vis not in ('private', 'public')
     or rec not in ('none', 'daily', 'weekly', 'biweekly', 'monthly') or dur < 0 or dur > 20160 then
    raise exception 'invalid' using errcode = '23514';
  end if;
  if char_length(ttl) < 1 then raise exception 'title_required'; end if;
  if starts is null then raise exception 'date_required'; end if;
  if url is not null and url !~ '^https?://' then raise exception 'invalid' using errcode = '23514'; end if;

  if is_new then
    insert into public.events (group_id, listing_id, owner_id, kind, title, description, starts_at, duration_minutes, all_day, tz, place,
      region_id, online_url, visibility, recur, recur_until, rsvp, capacity)
    values (gid, lid, me, k, left(ttl, 160), nullif(left(btrim(coalesce(p ->> 'description', '')), 4000), ''), starts, dur,
      coalesce((p ->> 'all_day')::boolean, false), coalesce(nullif(p ->> 'tz', ''), 'Europe/Berlin'),
      nullif(left(btrim(coalesce(p ->> 'place', '')), 200), ''), nullif(p ->> 'region_id', '')::uuid, left(url, 500), vis, rec,
      case when rec = 'none' then null else nullif(p ->> 'recur_until', '')::date end,
      case when k = 'duty' then false else coalesce((p ->> 'rsvp')::boolean, true) end, nullif(p ->> 'capacity', '')::int)
    returning id into eid;
  else
    update public.events set title = left(ttl, 160), description = nullif(left(btrim(coalesce(p ->> 'description', '')), 4000), ''),
      starts_at = starts, duration_minutes = dur, all_day = coalesce((p ->> 'all_day')::boolean, all_day),
      tz = coalesce(nullif(p ->> 'tz', ''), tz), place = nullif(left(btrim(coalesce(p ->> 'place', '')), 200), ''),
      region_id = nullif(p ->> 'region_id', '')::uuid, online_url = left(url, 500), visibility = vis, recur = rec,
      recur_until = case when rec = 'none' then null else nullif(p ->> 'recur_until', '')::date end,
      rsvp = case when k = 'duty' then false else coalesce((p ->> 'rsvp')::boolean, rsvp) end, capacity = nullif(p ->> 'capacity', '')::int,
      updated_at = now()
    where id = eid;
    if gid is not null then perform app.audit('event_updated', 'event', eid, gid, jsonb_build_object('title', left(ttl, 160))); end if;
  end if;

  -- Roles: kept by id, new ones added, the rest removed (answers keep the person, lose the role).
  if jsonb_typeof(p -> 'roles') = 'array' then
    for x in select * from jsonb_array_elements(p -> 'roles') loop
      i := i + 1;
      if i > 20 or char_length(btrim(coalesce(x ->> 'name', ''))) < 1 then continue; end if;
      pid := nullif(x ->> 'id', '')::uuid;
      if pid is not null and exists (select 1 from public.event_roles where id = pid and event_id = eid) then
        update public.event_roles set name = left(btrim(x ->> 'name'), 60), needed = greatest(1, least(1000, coalesce((x ->> 'needed')::int, 1))), position = i where id = pid;
      else
        insert into public.event_roles (event_id, name, needed, position)
        values (eid, left(btrim(x ->> 'name'), 60), greatest(1, least(1000, coalesce((x ->> 'needed')::int, 1))), i) returning id into pid;
      end if;
      keep := keep || pid;
    end loop;
    delete from public.event_roles where event_id = eid and not (id = any (keep));
  end if;

  -- A duty's order: members of the group only.
  if k = 'duty' and jsonb_typeof(p -> 'rotation') = 'array' then
    delete from public.duty_rotation where event_id = eid;
    insert into public.duty_rotation (event_id, profile_id, position)
    select eid, r.pid, min(r.o)::int from (select (v #>> '{}')::uuid as pid, o from jsonb_array_elements(p -> 'rotation') with ordinality as a(v, o)) r
    where exists (select 1 from public.group_members m where m.group_id = gid and m.profile_id = r.pid)
    group by r.pid;
    select count(*) into n_rot from public.duty_rotation where event_id = eid;
    if n_rot = 0 then raise exception 'rotation_required'; end if;
  end if;

  -- People invited to a personal date are told; nobody who blocked me or whom I blocked.
  if gid is null and jsonb_typeof(p -> 'guests') = 'array' then
    select display_name into my_name from public.profiles where id = me;
    for pid in select distinct (v #>> '{}')::uuid from jsonb_array_elements(p -> 'guests') v loop
      continue when pid = me or app.is_blocked_between(me, pid) or not exists (select 1 from public.profiles where id = pid);
      insert into public.event_guests (event_id, profile_id, invited_by) values (eid, pid, me) on conflict do nothing;
      if found then
        perform app.notify(pid, 'event_invite', jsonb_build_object('event_id', eid, 'title', left(ttl, 160), 'name', my_name, 'starts_at', starts));
      end if;
    end loop;
    delete from public.event_guests where event_id = eid and not (profile_id in (select (v #>> '{}')::uuid from jsonb_array_elements(p -> 'guests') v));
  end if;
  return eid;
end $$;
grant execute on function app.save_event(jsonb) to authenticated, hivevoice_server;

-- Cancel a whole date or series (it stays visible as cancelled), bring it back, or delete it for good.
create or replace function app.cancel_event(p_event uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events; r record;
begin
  if app.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event;
  if not found then raise exception 'not_found'; end if;
  if not app.can_edit_event(p_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_mode = 'cancel' then
    update public.events set cancelled_at = now(), updated_at = now() where id = p_event and cancelled_at is null;
    -- Everybody who said yes or maybe to a coming date hears of it.
    for r in select distinct profile_id from public.event_rsvps where event_id = p_event and occurs_at > now() and status in ('yes', 'maybe') and profile_id <> app.uid() loop
      perform app.notify(r.profile_id, 'event_cancelled', jsonb_build_object('event_id', p_event, 'title', e.title));
    end loop;
  elsif p_mode = 'restore' then
    update public.events set cancelled_at = null, updated_at = now() where id = p_event;
  elsif p_mode = 'delete' then
    delete from public.events where id = p_event;
  else
    raise exception 'invalid' using errcode = '23514';
  end if;
  if e.group_id is not null and p_mode <> 'restore' then
    perform app.audit('event_' || p_mode, 'event', p_event, e.group_id, jsonb_build_object('title', e.title));
  end if;
end $$;
grant execute on function app.cancel_event(uuid, text) to authenticated, hivevoice_server;

-- Cancel or bring back one date of a series.
create or replace function app.cancel_occurrence(p_event uuid, p_at timestamptz, p_cancelled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events; r record;
begin
  select * into e from public.events where id = p_event;
  if not found then raise exception 'not_found'; end if;
  if not app.can_edit_event(p_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  if app.is_event_time(e, p_at) is null then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.event_changes (event_id, occurs_at, cancelled) values (p_event, p_at, p_cancelled)
  on conflict (event_id, occurs_at) do update set cancelled = excluded.cancelled, updated_at = now();
  if p_cancelled then
    for r in select profile_id from public.event_rsvps where event_id = p_event and occurs_at = p_at and status in ('yes', 'maybe') and profile_id <> app.uid() loop
      perform app.notify(r.profile_id, 'event_cancelled', jsonb_build_object('event_id', p_event, 'title', e.title, 'occurs_at', p_at));
    end loop;
  end if;
end $$;
grant execute on function app.cancel_occurrence(uuid, timestamptz, boolean) to authenticated, hivevoice_server;

-- Zu- oder Absage for one date (null takes the answer back). A full date takes no more yes.
create or replace function app.rsvp(p_event uuid, p_at timestamptz, p_status text, p_role uuid default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); e public.events; yes_n int;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event;
  if not found or not app.can_read_event(p_event) then raise exception 'not_found'; end if;
  if not e.rsvp or e.cancelled_at is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  if app.is_event_time(e, p_at) is null then raise exception 'invalid' using errcode = '23514'; end if;
  if exists (select 1 from public.event_changes c where c.event_id = p_event and c.occurs_at = p_at and c.cancelled) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null then
    delete from public.event_rsvps where event_id = p_event and occurs_at = p_at and profile_id = me;
    return;
  end if;
  if p_status not in ('yes', 'maybe', 'no') then raise exception 'invalid' using errcode = '23514'; end if;
  if p_role is not null and not exists (select 1 from public.event_roles where id = p_role and event_id = p_event) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  if p_status = 'yes' and e.capacity is not null then
    select count(*) into yes_n from public.event_rsvps where event_id = p_event and occurs_at = p_at and status = 'yes' and profile_id <> me;
    if yes_n >= e.capacity then raise exception 'event_full'; end if;
  end if;
  insert into public.event_rsvps (event_id, occurs_at, profile_id, status, role_id, note)
  values (p_event, p_at, me, p_status, p_role, nullif(left(btrim(coalesce(p_note, '')), 280), ''))
  on conflict (event_id, occurs_at, profile_id) do update set status = excluded.status, role_id = excluded.role_id, note = excluded.note, updated_at = now();
end $$;
grant execute on function app.rsvp(uuid, timestamptz, text, uuid, text) to authenticated, hivevoice_server;

-- ───────────────────── duties: take over, look for cover, tick off, assign ─────────────────────
-- p_action: 'take' (I do it), 'cover' (I look for someone, the others in the order hear of it), 'uncover',
-- 'done', 'undone', 'assign' (admins and maintainers put someone on it: p_profile).
create or replace function app.duty(p_event uuid, p_at timestamptz, p_action text, p_profile uuid default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); e public.events; num int; who uuid; role public.group_role; my_name text; r record;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event;
  if not found or e.kind <> 'duty' then raise exception 'not_found'; end if;
  role := app.group_role(e.group_id);
  if role is null or role = 'guest' then raise exception 'forbidden' using errcode = '42501'; end if;
  num := app.is_event_time(e, p_at);
  if num is null then raise exception 'invalid' using errcode = '23514'; end if;
  who := app.duty_assignee(p_event, p_at, num);
  select display_name into my_name from public.profiles where id = me;
  insert into public.event_changes (event_id, occurs_at) values (p_event, p_at) on conflict do nothing;

  if p_action = 'take' then
    update public.event_changes set assignee_id = me, cover_wanted = false, updated_at = now() where event_id = p_event and occurs_at = p_at;
    if who is not null and who <> me then
      perform app.notify(who, 'duty_taken', jsonb_build_object('event_id', p_event, 'title', e.title, 'occurs_at', p_at, 'name', my_name));
    end if;
  elsif p_action in ('cover', 'uncover') then
    if who is distinct from me and role not in ('admin', 'maintainer') then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.event_changes set cover_wanted = (p_action = 'cover'), note = nullif(left(btrim(coalesce(p_note, '')), 280), ''), updated_at = now()
    where event_id = p_event and occurs_at = p_at;
    if p_action = 'cover' then
      for r in select m.profile_id from public.group_members m where m.group_id = e.group_id and m.profile_id is distinct from who and m.role <> 'guest'
                 and (exists (select 1 from public.duty_rotation d where d.event_id = p_event and d.profile_id = m.profile_id)) loop
        perform app.notify(r.profile_id, 'duty_cover', jsonb_build_object('event_id', p_event, 'title', e.title, 'occurs_at', p_at, 'name', my_name,
          'slug', (select slug::text from public.groups where id = e.group_id)));
      end loop;
    end if;
  elsif p_action in ('done', 'undone') then
    update public.event_changes set done_at = case when p_action = 'done' then now() end, done_by = case when p_action = 'done' then me end,
      cover_wanted = case when p_action = 'done' then false else cover_wanted end, updated_at = now()
    where event_id = p_event and occurs_at = p_at;
  elsif p_action = 'assign' then
    if role not in ('admin', 'maintainer') and e.owner_id <> me then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_profile is not null and not exists (select 1 from public.group_members m where m.group_id = e.group_id and m.profile_id = p_profile) then
      raise exception 'invalid' using errcode = '23514';
    end if;
    update public.event_changes set assignee_id = p_profile, cover_wanted = false, updated_at = now() where event_id = p_event and occurs_at = p_at;
    if p_profile is not null and p_profile <> me then
      perform app.notify(p_profile, 'duty_assigned', jsonb_build_object('event_id', p_event, 'title', e.title, 'occurs_at', p_at, 'name', my_name));
    end if;
  else
    raise exception 'invalid' using errcode = '23514';
  end if;
end $$;
grant execute on function app.duty(uuid, timestamptz, text, uuid, text) to authenticated, hivevoice_server;

-- ───────────────────── settings, iCal feed ─────────────────────
create or replace function app.calendar_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); c public.calendar_prefs;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.calendar_prefs (profile_id) values (me) on conflict do nothing;
  if p ? 'remind_day' then update public.calendar_prefs set remind_day = (p ->> 'remind_day')::boolean where profile_id = me; end if;
  if p ? 'remind_hour' then update public.calendar_prefs set remind_hour = (p ->> 'remind_hour')::boolean where profile_id = me; end if;
  if coalesce((p ->> 'new_token')::boolean, false) then
    update public.calendar_prefs set feed_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where profile_id = me;
  end if;
  select * into c from public.calendar_prefs where profile_id = me;
  return jsonb_build_object('remind_day', c.remind_day, 'remind_hour', c.remind_hour, 'feed_token', c.feed_token);
end $$;
grant execute on function app.calendar_settings(jsonb) to authenticated, hivevoice_server;

-- The dates of the person behind a feed key, 60 days back to a year ahead (for calendar apps; trusted call).
create or replace function app.calendar_feed(p_token text)
returns table (event_id uuid, occurs_at timestamptz, duration_minutes int, all_day boolean, tz text, title text, description text,
               place text, online_url text, group_name text, kind text, cancelled boolean, assignee_name text, my_status text,
               updated_at timestamptz, remind_day boolean, remind_hour boolean)
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid; c public.calendar_prefs;
begin
  select * into c from public.calendar_prefs where feed_token = p_token and char_length(p_token) >= 32;
  if not found then return; end if;
  pid := c.profile_id;
  return query
  select e.id, t.occurs_at, e.duration_minutes, e.all_day, e.tz, e.title, e.description, e.place, e.online_url, gr.name, e.kind,
         (e.cancelled_at is not null or coalesce(ch.cancelled, false)), a.display_name, r.status, greatest(e.updated_at, ch.updated_at, r.updated_at),
         c.remind_day, c.remind_hour
  from public.events e
  cross join lateral app.event_times(e, now() - interval '60 days', now() + interval '365 days') t
  left join public.groups gr on gr.id = e.group_id
  left join public.event_changes ch on ch.event_id = e.id and ch.occurs_at = t.occurs_at
  left join public.event_rsvps r on r.event_id = e.id and r.occurs_at = t.occurs_at and r.profile_id = pid
  left join public.profiles a on e.kind = 'duty' and a.id = app.duty_assignee(e.id, t.occurs_at, t.n)
  where (e.owner_id = pid
         or exists (select 1 from public.event_guests g where g.event_id = e.id and g.profile_id = pid)
         or (e.group_id is not null and 'calendar' = any (gr.tools) and exists (select 1 from public.group_members m where m.group_id = e.group_id and m.profile_id = pid))
         or r.status in ('yes', 'maybe')
         or exists (select 1 from public.event_rsvps r2 where r2.event_id = e.id and r2.profile_id = pid and r2.status in ('yes', 'maybe') and e.visibility = 'public'))
    and (r.status is distinct from 'no' or e.owner_id = pid)
  order by t.occurs_at
  limit 2000;
end $$;
revoke execute on function app.calendar_feed(text) from public, anon, authenticated;
grant execute on function app.calendar_feed(text) to hivevoice_server;

-- ───────────────────── reminders (pg_cron runs app.tick every five minutes) ─────────────────────
-- A day and an hour before: everybody who said yes, whoever is on duty, the owner of a personal date.
create or replace function app.calendar_tick() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    with due as (
      select e.id, e.title, e.kind, e.group_id, e.owner_id, e.created_at, t.occurs_at, t.n as num
      from public.events e cross join lateral app.event_times(e, now(), now() + interval '1 day') t
      where e.cancelled_at is null and e.starts_at < now() + interval '1 day' and t.occurs_at > now()
        and not exists (select 1 from public.event_changes c where c.event_id = e.id and c.occurs_at = t.occurs_at and c.cancelled)
    ), who as (
      select d.*, x.profile_id from due d cross join lateral (
        select rv.profile_id from public.event_rsvps rv where rv.event_id = d.id and rv.occurs_at = d.occurs_at and rv.status = 'yes'
        union select app.duty_assignee(d.id, d.occurs_at, d.num) where d.kind = 'duty'
        union select d.owner_id where d.group_id is null and d.kind = 'event'
      ) x where x.profile_id is not null
    )
    select w.*, k.kind as rkind from who w
    cross join lateral (values ('1d'), ('1h')) k(kind)
    left join public.calendar_prefs p on p.profile_id = w.profile_id
    where (k.kind = '1d' and w.occurs_at - now() > interval '1 hour' and coalesce(p.remind_day, true) and w.created_at < w.occurs_at - interval '1 day')
       or (k.kind = '1h' and w.occurs_at - now() <= interval '1 hour' and coalesce(p.remind_hour, true))
  loop
    insert into private.event_reminders_sent (event_id, occurs_at, profile_id, kind) values (r.id, r.occurs_at, r.profile_id, r.rkind)
    on conflict do nothing;
    if found then
      perform app.notify(r.profile_id, 'event_reminder', jsonb_build_object('event_id', r.id, 'title', r.title, 'occurs_at', r.occurs_at,
        'kind', r.kind, 'when', r.rkind));
      n := n + 1;
    end if;
  end loop;
  delete from private.event_reminders_sent where occurs_at < now() - interval '30 days';
  return n;
end $$;

create or replace function app.tick() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.ballots where status = 'open' and closes_at <= now() loop
    perform app.close_ballot(r.id); n := n + 1;
  end loop;
  perform app.jury_timeouts();
  perform app.purge_expired_messages();
  perform app.execute_transfers();
  perform app.close_motions();
  perform app.archive_orphans();
  perform app.purge_deleted_groups();
  perform app.expire_author_invites();
  perform app.responsibility_tick();
  perform app.dispute_tick();
  perform app.documents_tick();
  perform app.moderation_tick();
  perform app.calendar_tick();
  return n;
end $$;

-- ───────────────────── private chats may switch the calendar on too ─────────────────────
create or replace function app.chat_tools(p_conversation uuid, p_tools text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); gid uuid; s text; names text;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_tools, '{}')) t where t not in ('goals', 'tasks', 'links', 'collection', 'needs', 'expenses', 'calendar')) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  select id, slug::text into gid, s from public.groups where conversation_id = p_conversation;
  if gid is null then
    if cardinality(coalesce(p_tools, '{}')) = 0 then return null; end if;
    select string_agg(split_part(p.display_name, ' ', 1), ' & ' order by p.display_name) into names
      from public.conversation_participants cp join public.profiles p on p.id = cp.profile_id where cp.conversation_id = p_conversation;
    insert into public.groups (slug, name, kind, visibility, join_policy, mod_tasks, created_by, owner_id, template, tools, conversation_id)
    values (app.unique_group_slug('chat ' || names), names, 'project', 'secret', 'invite', true, me, me, 'project', p_tools, p_conversation)
    returning id, slug::text into gid, s;
    insert into public.group_members (group_id, profile_id, role)
      select gid, cp.profile_id, 'admin' from public.conversation_participants cp where cp.conversation_id = p_conversation;
    perform app.seed_group_permissions(gid, 'project');
  else
    update public.groups set tools = coalesce(p_tools, '{}') where id = gid;
  end if;
  return s;
end $$;
