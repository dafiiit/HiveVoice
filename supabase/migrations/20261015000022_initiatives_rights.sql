-- Rights, stage 4: initiatives.
--   co-authors by invitation, removal by majority, handing over the lead, attaching a group;
--   text frozen while a vote runs (typo corrections only, visible), a note for every change;
--   thresholds before a vote may start, account must exist before the vote opens;
--   withdraw, delete (only while nothing happened), block (platform admins, with a reason).

-- ───────────────────────── central numbers ─────────────────────────
create table public.rule_params (
  key text primary key,
  value int not null check (value >= 0),
  description text not null,
  updated_at timestamptz not null default now()
);
alter table public.rule_params enable row level security;
create policy read_all on public.rule_params for select using (true);
grant select on public.rule_params to anon, authenticated;

insert into public.rule_params (key, value, description) values
  ('support_country', 1000, 'Supporters before a vote may start: federal level'),
  ('support_state', 250, 'Supporters before a vote may start: state level'),
  ('support_district', 50, 'Supporters before a vote may start: district level'),
  ('support_municipality', 10, 'Supporters before a vote may start: municipality'),
  ('support_borough', 5, 'Supporters before a vote may start: borough'),
  ('support_community', 3, 'Supporters before a vote may start: community'),
  ('debate_min_days', 7, 'Days an initiative is public before its vote may start'),
  ('ballot_min_days', 3, 'Shortest vote'),
  ('ballot_max_days', 60, 'Longest vote'),
  ('authors_max', 5, 'Authors per initiative'),
  ('typo_max_words', 3, 'New words allowed per text while a vote runs (typo corrections)'),
  ('typo_max_chars', 20, 'Length change allowed per text while a vote runs'),
  ('author_invite_days', 14, 'Days a co-author invitation stays open')
on conflict (key) do nothing;

create or replace function app.param(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select value from public.rule_params where key = p_key
$$;

create or replace function app.support_threshold(p_region uuid) returns int
language sql stable security definer set search_path = '' as $$
  select app.param('support_' || r.level::text) from public.regions r where r.id = p_region
$$;

create or replace function app.set_param(p_key text, p_value int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_action('admin');
  update public.rule_params set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'not_found'; end if;
  perform app.audit('param_changed', 'param', null, null, jsonb_build_object('key', p_key, 'value', p_value));
end $$;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values
  ('initiative_invite', 2, null, 20, 24)
on conflict (action) do nothing;

-- ───────────────────────── columns ─────────────────────────
alter table public.initiatives
  add column lead_id uuid references public.profiles(id) on delete set null,
  add column blocked_at timestamptz,
  add column blocked_reason text,
  add column withdrawn_at timestamptz,
  add column withdrawn_note text;
update public.initiatives set lead_id = created_by where lead_id is null;

alter table public.groups add column admins_manage_initiatives boolean not null default false;
grant update (admins_manage_initiatives) on public.groups to authenticated;

-- Texts change only through app.update_initiative (note, freeze, revision).
revoke update (title, summary, body, body_easy, addressee_responsibility_id, addressee_text, cost_estimate_cents)
  on public.initiatives from authenticated;

-- ───────────────────────── who is an author ─────────────────────────
create or replace function app.is_initiative_author(p_init uuid, p_profile uuid default app.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.initiative_authors where initiative_id = p_init and profile_id = p_profile)
$$;

-- Authors, and the admins of the attached group when the group allows it.
create or replace function app.can_edit_initiative(p_init uuid, p_profile uuid default app.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_initiative_author(p_init, p_profile) or exists (
    select 1 from public.initiatives i join public.groups g on g.id = i.group_id
    where i.id = p_init and g.admins_manage_initiatives
      and exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id = p_profile and m.role = 'admin'))
$$;

-- ───────────────────────── co-author invitations ─────────────────────────
create table public.initiative_author_invites (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index on public.initiative_author_invites (initiative_id, profile_id) where status = 'pending';
alter table public.initiative_author_invites enable row level security;
create policy involved on public.initiative_author_invites for select to authenticated using (
  profile_id = app.uid() or invited_by = app.uid() or app.is_initiative_author(initiative_id));
grant select on public.initiative_author_invites to authenticated;

create or replace function app.invite_author(p_init uuid, p_profile uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('initiative_invite'); i public.initiatives; why text; vid uuid;
begin
  select * into i from public.initiatives where id = p_init;
  if not found then raise exception 'not_found'; end if;
  if not app.is_initiative_author(p_init, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if i.outcome is not null or i.blocked_at is not null then raise exception 'closed'; end if;
  if p_profile = me or app.is_initiative_author(p_init, p_profile) then raise exception 'invalid' using errcode = '23514'; end if;
  if (select count(*) from public.initiative_authors where initiative_id = p_init)
     + (select count(*) from public.initiative_author_invites where initiative_id = p_init and status = 'pending') >= app.param('authors_max') then
    raise exception 'too_many_authors';
  end if;
  if not app.profile_is_verified(p_profile) then raise exception 'not_verified' using errcode = '42501'; end if;
  why := app.contact_block_reason(me, p_profile);
  if why is not null then raise exception '%', why using errcode = '42501'; end if;
  insert into public.initiative_author_invites (initiative_id, profile_id, invited_by) values (p_init, p_profile, me) returning id into vid;
  perform app.notify(p_profile, 'initiative_author_invite',
    jsonb_build_object('initiative_id', i.id, 'title', i.title, 'by', (select display_name from public.profiles where id = me), 'invite_id', vid));
  perform app.audit('initiative_invite_author', 'initiative', p_init, null, jsonb_build_object('profile', p_profile));
  return vid;
end $$;

create or replace function app.decide_author_invite(p_invite uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); v public.initiative_author_invites; i public.initiatives; myname text;
begin
  select * into v from public.initiative_author_invites where id = p_invite and profile_id = me and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  select * into i from public.initiatives where id = v.initiative_id;
  select display_name into myname from public.profiles where id = me;
  if p_accept then
    perform app.require_real_name();
    if i.outcome is not null or i.blocked_at is not null then raise exception 'closed'; end if;
    if (select count(*) from public.initiative_authors where initiative_id = i.id) >= app.param('authors_max') then raise exception 'too_many_authors'; end if;
    insert into public.initiative_authors (initiative_id, profile_id) values (i.id, me) on conflict do nothing;
    update public.initiative_author_invites set status = 'accepted', decided_at = now() where id = p_invite;
    perform app.notify(a.profile_id, 'initiative_author_joined', jsonb_build_object('initiative_id', i.id, 'title', i.title, 'name', myname))
      from public.initiative_authors a where a.initiative_id = i.id and a.profile_id <> me;
    perform app.audit('initiative_author_joined', 'initiative', i.id, null, '{}'::jsonb);
  else
    update public.initiative_author_invites set status = 'declined', decided_at = now() where id = p_invite;
    perform app.notify(v.invited_by, 'initiative_author_declined', jsonb_build_object('initiative_id', i.id, 'title', i.title, 'name', myname));
  end if;
  return i.id;
end $$;

create or replace function app.withdraw_author_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); v public.initiative_author_invites;
begin
  select * into v from public.initiative_author_invites where id = p_invite and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  if not app.is_initiative_author(v.initiative_id, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.initiative_author_invites set status = 'withdrawn', decided_at = now() where id = p_invite;
end $$;

create or replace function app.expire_author_invites() returns void
language sql security definer set search_path = '' as $$
  update public.initiative_author_invites set status = 'withdrawn', decided_at = now()
   where status = 'pending' and created_at < now() - make_interval(days => app.param('author_invite_days'))
$$;

-- ───────────────────────── leaving, handing over, removing ─────────────────────────
create or replace function app.leave_initiative(p_init uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); i public.initiatives;
begin
  select * into i from public.initiatives where id = p_init;
  if not found or not app.is_initiative_author(p_init, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if i.lead_id = me then raise exception 'lead_must_hand_over'; end if;
  delete from public.initiative_authors where initiative_id = p_init and profile_id = me;
  update public.initiative_removals set status = 'kept' where initiative_id = p_init and subject_id = me and status = 'open';
  perform app.notify(a.profile_id, 'initiative_author_left', jsonb_build_object('initiative_id', i.id, 'title', i.title,
    'name', (select display_name from public.profiles where id = me)))
    from public.initiative_authors a where a.initiative_id = p_init;
end $$;

create or replace function app.hand_over_lead(p_init uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); i public.initiatives;
begin
  select * into i from public.initiatives where id = p_init for update;
  if not found then raise exception 'not_found'; end if;
  if i.lead_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_to = me or not app.is_initiative_author(p_init, p_to) then raise exception 'invalid' using errcode = '23514'; end if;
  update public.initiatives set lead_id = p_to where id = p_init;
  perform app.notify(p_to, 'initiative_lead', jsonb_build_object('initiative_id', i.id, 'title', i.title));
  perform app.audit('initiative_lead', 'initiative', p_init, null, jsonb_build_object('from', me, 'to', p_to));
end $$;

create table public.initiative_removals (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  proposed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'removed', 'kept')),
  created_at timestamptz not null default now()
);
create unique index on public.initiative_removals (initiative_id, subject_id) where status = 'open';
create table public.initiative_removal_votes (
  removal_id uuid not null references public.initiative_removals(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  yes boolean not null,
  primary key (removal_id, voter_id)
);
alter table public.initiative_removals enable row level security;
alter table public.initiative_removal_votes enable row level security;
create policy authors on public.initiative_removals for select to authenticated using (app.is_initiative_author(initiative_id));
create policy authors on public.initiative_removal_votes for select to authenticated using (
  exists (select 1 from public.initiative_removals r where r.id = removal_id and app.is_initiative_author(r.initiative_id)));
grant select on public.initiative_removals, public.initiative_removal_votes to authenticated;

-- A strict majority of all authors removes (with two authors that means both agree).
create or replace function app.tally_removal(p_removal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.initiative_removals; n int; n_yes int; n_no int; i public.initiatives;
begin
  select * into r from public.initiative_removals where id = p_removal and status = 'open' for update;
  if not found then return; end if;
  select * into i from public.initiatives where id = r.initiative_id;
  select count(*) into n from public.initiative_authors where initiative_id = r.initiative_id;
  select count(*) filter (where v.yes), count(*) filter (where not v.yes) into n_yes, n_no
    from public.initiative_removal_votes v where v.removal_id = p_removal and app.is_initiative_author(r.initiative_id, v.voter_id);
  if n_yes * 2 > n then
    delete from public.initiative_authors where initiative_id = r.initiative_id and profile_id = r.subject_id;
    update public.initiative_removals set status = 'removed' where id = p_removal;
    perform app.notify(r.subject_id, 'initiative_author_removed', jsonb_build_object('initiative_id', i.id, 'title', i.title));
    perform app.audit('initiative_author_removed', 'initiative', i.id, null, jsonb_build_object('profile', r.subject_id));
  elsif n_no * 2 >= n then
    update public.initiative_removals set status = 'kept' where id = p_removal;
  end if;
end $$;

create or replace function app.propose_author_removal(p_init uuid, p_subject uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); i public.initiatives; rid uuid;
begin
  select * into i from public.initiatives where id = p_init;
  if not found or not app.is_initiative_author(p_init, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_subject = me or not app.is_initiative_author(p_init, p_subject) then raise exception 'invalid' using errcode = '23514'; end if;
  if i.lead_id = p_subject then raise exception 'lead_must_hand_over'; end if;
  insert into public.initiative_removals (initiative_id, subject_id, proposed_by) values (p_init, p_subject, me) returning id into rid;
  insert into public.initiative_removal_votes (removal_id, voter_id, yes) values (rid, me, true);
  perform app.notify(a.profile_id, 'initiative_removal', jsonb_build_object('initiative_id', i.id, 'title', i.title,
    'name', (select display_name from public.profiles where id = p_subject)))
    from public.initiative_authors a where a.initiative_id = p_init and a.profile_id <> me;
  perform app.tally_removal(rid);
  return rid;
end $$;

create or replace function app.vote_author_removal(p_removal uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.initiative_removals;
begin
  select * into r from public.initiative_removals where id = p_removal and status = 'open';
  if not found then raise exception 'not_found'; end if;
  if not app.is_initiative_author(r.initiative_id, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.initiative_removal_votes (removal_id, voter_id, yes) values (p_removal, me, p_yes)
  on conflict (removal_id, voter_id) do update set yes = excluded.yes;
  perform app.tally_removal(p_removal);
end $$;

-- Attach the initiative to a group (or detach): the lead, and an admin of that group.
create or replace function app.set_initiative_group(p_init uuid, p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); i public.initiatives;
begin
  select * into i from public.initiatives where id = p_init;
  if not found then raise exception 'not_found'; end if;
  if i.lead_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_group is not null and not exists (select 1 from public.group_members m where m.group_id = p_group and m.profile_id = me and m.role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.initiatives set group_id = p_group where id = p_init;
  perform app.audit('initiative_group', 'initiative', p_init, p_group, '{}'::jsonb);
end $$;

-- ───────────────────────── creating and editing ─────────────────────────
create or replace function app.create_initiative(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid; iid uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
begin
  if char_length(coalesce(trim(p ->> 'title'), '')) < 5 then raise exception 'title_required'; end if;
  if nullif(p ->> 'region_id', '') is null then raise exception 'region_required'; end if;
  me := app.require_action('initiative_create');
  perform app.require_real_name();
  if gid is not null and not exists (select 1 from public.group_members m where m.group_id = gid and m.profile_id = me and m.role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.initiatives (title, summary, body, body_easy, region_id, addressee_responsibility_id, addressee_text,
                                  cost_estimate_cents, group_id, created_by, lead_id, published_at)
  values (trim(p ->> 'title'), p ->> 'summary', p ->> 'body', nullif(p ->> 'body_easy', ''), (p ->> 'region_id')::uuid,
          nullif(p ->> 'addressee_responsibility_id', '')::uuid, nullif(p ->> 'addressee_text', ''),
          nullif(p ->> 'cost_estimate_cents', '')::bigint, gid, me, me,
          case when coalesce((p ->> 'publish')::boolean, true) then now() end)
  returning id into iid;
  insert into public.initiative_authors (initiative_id, profile_id) values (iid, me);
  insert into public.initiative_tags (initiative_id, tag_id)
    select iid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]')))))
    on conflict do nothing;
  return iid;
end $$;

create or replace function app.initiative_frozen(p_init uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ballots where initiative_id = p_init and status = 'open')
      or exists (select 1 from public.initiatives where id = p_init and phase in ('addressee', 'implementation', 'done'))
$$;

-- How many words of the new text are not in the old one (a typo fix changes one or two).
create or replace function app.new_words(p_old text, p_new text) returns int
language sql immutable as $$
  select count(*)::int from (
    select unnest(regexp_split_to_array(lower(coalesce(p_new, '')), '\s+'))
    except select unnest(regexp_split_to_array(lower(coalesce(p_old, '')), '\s+'))) w
$$;

create or replace function app.trg_initiative_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (old.title, old.summary, old.body, old.body_easy, old.addressee_text, old.cost_estimate_cents)
     is distinct from (new.title, new.summary, new.body, new.body_easy, new.addressee_text, new.cost_estimate_cents) then
    insert into public.initiative_revisions (initiative_id, editor_id, note, snapshot)
    values (new.id, app.uid(), nullif(current_setting('app.revision_note', true), ''), jsonb_build_object('title', new.title, 'summary', new.summary, 'body', new.body,
            'body_easy', new.body_easy, 'addressee_text', new.addressee_text, 'cost_estimate_cents', new.cost_estimate_cents));
    new.updated_at := now();
  end if;
  return new;
end $$;

-- Every change carries a note once the debate runs. While a vote runs (and after it) the text is
-- frozen: only small corrections, with a note that everybody can read and the supporters get.
create or replace function app.update_initiative(p_init uuid, p jsonb, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); i public.initiatives; frozen boolean; note text := nullif(trim(coalesce(p_note, '')), '');
        n_title text; n_summary text; n_body text; n_easy text; n_addr text; n_resp uuid; n_cost bigint;
        changed boolean; max_chars int := app.param('typo_max_chars'); max_words int := app.param('typo_max_words');
begin
  select * into i from public.initiatives where id = p_init for update;
  if not found then raise exception 'not_found'; end if;
  if not app.can_edit_initiative(p_init, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if i.outcome is not null or i.blocked_at is not null then raise exception 'closed'; end if;
  n_title := coalesce(nullif(trim(p ->> 'title'), ''), i.title);
  n_summary := case when p ? 'summary' then nullif(p ->> 'summary', '') else i.summary end;
  n_body := case when p ? 'body' then nullif(p ->> 'body', '') else i.body end;
  n_easy := case when p ? 'body_easy' then nullif(p ->> 'body_easy', '') else i.body_easy end;
  n_addr := case when p ? 'addressee_text' then nullif(p ->> 'addressee_text', '') else i.addressee_text end;
  n_resp := case when p ? 'addressee_responsibility_id' then nullif(p ->> 'addressee_responsibility_id', '')::uuid else i.addressee_responsibility_id end;
  n_cost := case when p ? 'cost_estimate_cents' then nullif(p ->> 'cost_estimate_cents', '')::bigint else i.cost_estimate_cents end;
  if char_length(n_title) < 5 then raise exception 'title_required'; end if;
  changed := (n_title, n_summary, n_body, n_easy, n_addr, n_resp, n_cost)
             is distinct from (i.title, i.summary, i.body, i.body_easy, i.addressee_text, i.addressee_responsibility_id, i.cost_estimate_cents);
  if not changed then return; end if;
  frozen := app.initiative_frozen(p_init);
  if frozen then
    if note is null or char_length(note) < 5 then raise exception 'note_required'; end if;
    if n_resp is distinct from i.addressee_responsibility_id or n_addr is distinct from i.addressee_text or n_cost is distinct from i.cost_estimate_cents then
      raise exception 'frozen';
    end if;
    if abs(char_length(n_title) - char_length(i.title)) > max_chars
       or abs(char_length(coalesce(n_summary, '')) - char_length(coalesce(i.summary, ''))) > max_chars
       or abs(char_length(coalesce(n_body, '')) - char_length(coalesce(i.body, ''))) > max_chars
       or abs(char_length(coalesce(n_easy, '')) - char_length(coalesce(i.body_easy, ''))) > max_chars
       or app.new_words(i.title, n_title) > max_words or app.new_words(i.summary, n_summary) > max_words
       or app.new_words(i.body, n_body) > max_words or app.new_words(i.body_easy, n_easy) > max_words then
      raise exception 'too_big_change';
    end if;
    note := 'correction: ' || note;
  elsif i.phase = 'debate' and (note is null or char_length(note) < 5) then
    raise exception 'note_required';
  end if;
  perform set_config('app.revision_note', coalesce(note, ''), true);
  update public.initiatives set title = n_title, summary = n_summary, body = n_body, body_easy = n_easy,
         addressee_text = n_addr, addressee_responsibility_id = n_resp, cost_estimate_cents = n_cost
   where id = p_init;
  perform set_config('app.revision_note', '', true);
  if frozen then
    perform app.notify(s.profile_id, 'initiative_correction', jsonb_build_object('initiative_id', i.id, 'title', n_title, 'note', note))
      from public.initiative_supports s where s.initiative_id = p_init and s.profile_id <> me;
    perform app.audit('initiative_correction', 'initiative', p_init, null, jsonb_build_object('note', note));
  end if;
end $$;

-- ───────────────────────── the vote ─────────────────────────
create or replace function app.start_initiative_ballot(p_initiative uuid, p_question text, p_days int default 7, p_quorum int default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); i public.initiatives; bid uuid; days int;
begin
  select * into i from public.initiatives where id = p_initiative;
  if not found then raise exception 'not_found'; end if;
  if not app.can_edit_initiative(p_initiative, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app.require_real_name();
  if i.blocked_at is not null then raise exception 'closed'; end if;
  if i.phase <> 'debate' or i.outcome is not null then raise exception 'wrong_phase'; end if;
  if exists (select 1 from public.ballots where initiative_id = p_initiative and status = 'open') then raise exception 'ballot_running'; end if;
  if i.published_at is null or i.published_at > now() - make_interval(days => app.param('debate_min_days')) then raise exception 'debate_too_short'; end if;
  if i.support_count < app.support_threshold(i.region_id) then raise exception 'not_enough_support'; end if;
  days := least(greatest(coalesce(p_days, 7), app.param('ballot_min_days')), app.param('ballot_max_days'));
  insert into public.ballots (subject_type, initiative_id, question, eligible_region_id, quorum_pct, closes_at, created_by)
  values ('initiative', p_initiative, coalesce(nullif(trim(p_question), ''), i.title), i.region_id,
          least(greatest(coalesce(p_quorum, 0), 0), 100), now() + make_interval(days => days), me)
  returning id into bid;
  perform app.notify(s.profile_id, 'initiative_vote', jsonb_build_object('initiative_id', i.id, 'title', i.title))
    from public.initiative_supports s where s.initiative_id = p_initiative and s.profile_id <> me;
  perform app.audit('initiative_ballot', 'initiative', p_initiative, null, jsonb_build_object('days', days));
  return bid;
end $$;

-- Only accounts that existed when the vote opened count as affected (no vote farms).
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
  if b.eligible_region_id is not null
     and exists (select 1 from public.user_regions where profile_id = p_profile and region_id = b.eligible_region_id)
     and exists (select 1 from public.profiles where id = p_profile and created_at <= b.opens_at) then
    return 'affected';
  end if;
  return 'external';
end $$;

create or replace function app.ballot_turnout(p_ballot uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'voters', (select jsonb_object_agg(segment, n) from (
       select segment, count(*) n from public.ballot_participation where ballot_id = p_ballot group by segment) s),
    'eligible', (select case b.subject_type
        when 'goal' then (select count(*) from public.group_members m where m.group_id = b.group_id and m.role <> 'guest')
        else (select count(distinct ur.profile_id) from public.user_regions ur
              join public.profiles p on p.id = ur.profile_id
              where ur.region_id = b.eligible_region_id and p.created_at <= b.opens_at and app.profile_is_verified(p.id)) end
      from public.ballots b where b.id = p_ballot))
  where app.can_read_ballot(p_ballot)
$$;

-- Calls off a running vote; nothing of it is kept (no votes, no list of who took part).
create or replace function app.drop_open_ballot(p_init uuid, p_reason text, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.ballots; i public.initiatives;
begin
  select * into b from public.ballots where initiative_id = p_init and status = 'open' for update;
  if not found then return; end if;
  select * into i from public.initiatives where id = p_init;
  perform app.notify(x.profile_id, p_kind, jsonb_build_object('initiative_id', i.id, 'title', i.title, 'reason', p_reason))
    from (select profile_id from public.initiative_supports where initiative_id = p_init
          union select profile_id from public.ballot_participation where ballot_id = b.id
          union select profile_id from public.initiative_authors where initiative_id = p_init) x
   where x.profile_id is distinct from app.uid();
  delete from private.ballot_votes where ballot_id = b.id;
  delete from public.ballot_participation where ballot_id = b.id;
  update public.ballots set status = 'cancelled' where id = b.id;
end $$;

create or replace function app.cancel_initiative_ballot(p_init uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (select 1 from public.initiatives where id = p_init) then raise exception 'not_found'; end if;
  if not app.can_edit_initiative(p_init, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if reason is null or char_length(reason) < 10 then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.ballots where initiative_id = p_init and status = 'open') then raise exception 'wrong_phase'; end if;
  perform app.drop_open_ballot(p_init, reason, 'initiative_ballot_cancelled');
  perform app.audit('initiative_ballot_cancelled', 'initiative', p_init, null, jsonb_build_object('reason', reason));
end $$;

-- ───────────────────────── withdrawing, deleting, blocking ─────────────────────────
drop function if exists app.withdraw_initiative(uuid);
create or replace function app.withdraw_initiative(p_initiative uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); i public.initiatives; note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into i from public.initiatives where id = p_initiative for update;
  if not found then raise exception 'not_found'; end if;
  if i.lead_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if i.outcome is not null then raise exception 'closed'; end if;
  perform app.drop_open_ballot(p_initiative, coalesce(note, ''), 'initiative_ballot_cancelled');
  update public.initiatives set outcome = 'withdrawn', withdrawn_at = now(), withdrawn_note = note where id = p_initiative;
  perform app.notify(x.profile_id, 'initiative_withdrawn', jsonb_build_object('initiative_id', i.id, 'title', i.title, 'note', note))
    from (select profile_id from public.initiative_supports where initiative_id = p_initiative
          union select profile_id from public.initiative_authors where initiative_id = p_initiative) x
   where x.profile_id <> me;
  perform app.audit('initiative_withdrawn', 'initiative', p_initiative, null, jsonb_build_object('note', note));
end $$;

-- Deleting is possible only while nothing has happened: no support from others, no vote, no contribution of others.
create or replace function app.delete_initiative(p_init uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); i public.initiatives;
begin
  select * into i from public.initiatives where id = p_init for update;
  if not found then raise exception 'not_found'; end if;
  if i.lead_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.initiative_supports s where s.initiative_id = p_init and not app.is_initiative_author(p_init, s.profile_id))
     or exists (select 1 from public.ballots where initiative_id = p_init)
     or exists (select 1 from public.arguments a where a.initiative_id = p_init and not app.is_initiative_author(p_init, a.author_id))
     or exists (select 1 from public.posts x where x.initiative_id = p_init and not app.is_initiative_author(p_init, x.author_id)) then
    raise exception 'has_activity';
  end if;
  delete from public.initiatives where id = p_init;
  perform app.audit('initiative_deleted', 'initiative', p_init, null, jsonb_build_object('title', i.title));
end $$;

create or replace function app.block_initiative(p_init uuid, p_reason text, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.initiatives; reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform app.require_action('moderate_platform');
  select * into i from public.initiatives where id = p_init for update;
  if not found then raise exception 'not_found'; end if;
  if p_on and (reason is null or char_length(reason) < 10) then raise exception 'reason_required'; end if;
  if p_on then perform app.drop_open_ballot(p_init, reason, 'initiative_ballot_cancelled'); end if;
  update public.initiatives set blocked_at = case when p_on then now() end, blocked_reason = case when p_on then reason end where id = p_init;
  perform app.notify(a.profile_id, case when p_on then 'initiative_blocked' else 'initiative_unblocked' end,
    jsonb_build_object('initiative_id', i.id, 'title', i.title, 'reason', reason))
    from public.initiative_authors a where a.initiative_id = p_init;
  perform app.audit(case when p_on then 'initiative_blocked' else 'initiative_unblocked' end, 'initiative', p_init, null, jsonb_build_object('reason', reason));
end $$;

-- A blocked initiative can no longer gather support.
drop policy if exists support on public.initiative_supports;
create policy support on public.initiative_supports for insert to authenticated with check (
  profile_id = app.uid() and app.is_verified()
  and not exists (select 1 from public.initiatives i where i.id = initiative_id and (i.blocked_at is not null or i.outcome is not null)));

-- ───────────────────────── the scheduler ─────────────────────────
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
  return n;
end $$;

grant execute on function app.param(text), app.support_threshold(uuid), app.is_initiative_author(uuid, uuid), app.can_edit_initiative(uuid, uuid),
  app.initiative_frozen(uuid), app.new_words(text, text)
  to anon, authenticated, hivevoice_server;
grant execute on function app.set_param(text, int), app.invite_author(uuid, uuid), app.decide_author_invite(uuid, boolean), app.withdraw_author_invite(uuid),
  app.leave_initiative(uuid), app.hand_over_lead(uuid, uuid), app.propose_author_removal(uuid, uuid), app.vote_author_removal(uuid, boolean),
  app.set_initiative_group(uuid, uuid), app.create_initiative(jsonb), app.update_initiative(uuid, jsonb, text),
  app.start_initiative_ballot(uuid, text, int, int), app.cancel_initiative_ballot(uuid, text), app.withdraw_initiative(uuid, text),
  app.delete_initiative(uuid), app.block_initiative(uuid, text, boolean)
  to authenticated, hivevoice_server;
