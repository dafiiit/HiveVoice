-- Rights, stage 7: moderation.
--   more reasons, an emergency path (a platform admin looks at once, content is hidden meanwhile),
--   jurors who do not know the people involved, a ladder of consequences (notice, warning and pause, seven days, review),
--   one appeal heard by a different jury, retention of six months, a yearly transparency report, a log of disclosures to authorities,
--   and for server admins: two sets of eyes for rights and blocks, a log everybody can read, and logged emergency access to a chat.

insert into public.rule_params (key, value, description) values
  ('violation_months', 12, 'Months a violation counts towards the ladder'),
  ('pause_hours', 24, 'Write pause after the second violation (hours)'),
  ('ban_days', 7, 'Suspension after the third violation (days)'),
  ('appeal_days', 14, 'Days to appeal a decision'),
  ('retention_months', 6, 'Months reports and decisions are kept'),
  ('report_poor_min', 5, 'Dismissed reports in 30 days before the reporter is slowed down'),
  ('chat_access_minutes', 60, 'Minutes an approved emergency access to a chat stays open')
on conflict (key) do nothing;

-- ───────────────────────── columns and tables ─────────────────────────
alter table public.reports
  add column case_no text,
  add column emergency boolean not null default false,
  add column quarantined boolean not null default false,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz;
update public.reports r set case_no = c.case_no from public.jury_cases c where c.report_id = r.id;

alter table public.jury_cases
  add column round int not null default 1,
  add column appeal_of uuid references public.jury_cases(id) on delete set null;
alter table public.jury_cases drop constraint if exists jury_cases_report_id_key;
create unique index on public.jury_cases (report_id, round);

create table public.violations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  step int not null,
  outcome text not null check (outcome in ('notice', 'warning', 'suspension', 'review')),
  sanction_id uuid references public.sanctions(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.violations (profile_id, created_at desc);
alter table public.violations enable row level security;
create policy own on public.violations for select to authenticated using (profile_id = app.uid());
grant select on public.violations to authenticated;

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  appeal_case_id uuid references public.jury_cases(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.appeals enable row level security;
create policy own on public.appeals for select to authenticated using (appellant_id = app.uid());
grant select on public.appeals to authenticated;

create table public.admin_actions (
  id bigint generated always as identity primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
create policy read_all on public.admin_actions for select using (true);
grant select on public.admin_actions to anon, authenticated;

create table public.admin_proposals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('grant_admin', 'revoke_admin', 'ban', 'unban', 'block_initiative', 'unblock_initiative', 'chat_access')),
  subject_id uuid not null,
  reason text,
  proposed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.admin_proposals enable row level security;
create policy admins on public.admin_proposals for select to authenticated using (exists (select 1 from public.server_admins a where a.profile_id = app.uid()));
grant select on public.admin_proposals to authenticated;

create table public.legal_disclosures (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  authority text not null,
  scope text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.legal_disclosures enable row level security;
create policy admins on public.legal_disclosures for select to authenticated using (exists (select 1 from public.server_admins a where a.profile_id = app.uid()));
grant select on public.legal_disclosures to authenticated;

create table public.chat_access (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.chat_access enable row level security;

-- ───────────────────────── the ladder of consequences ─────────────────────────
-- 1st violation: a notice. 2nd: warning and a write pause. 3rd: a seven day suspension. After that a platform admin looks at the person.
create or replace function app.apply_violation(p_profile uuid, p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n int; step text; sid uuid; r public.reports;
begin
  if p_profile is null then return; end if;
  select * into r from public.reports where id = p_report;
  select count(*) + 1 into n from public.violations
   where profile_id = p_profile and revoked_at is null and created_at > now() - make_interval(months => app.param('violation_months'));
  step := case n when 1 then 'notice' when 2 then 'warning' when 3 then 'suspension' else 'review' end;
  if n = 2 then
    insert into public.sanctions (profile_id, kind, reason, ends_at) values (p_profile, 'pause', 'warning', now() + make_interval(hours => app.param('pause_hours'))) returning id into sid;
  elsif n = 3 then
    insert into public.sanctions (profile_id, kind, reason, ends_at) values (p_profile, 'ban', 'suspension', now() + make_interval(days => app.param('ban_days'))) returning id into sid;
  end if;
  insert into public.violations (profile_id, report_id, step, outcome, sanction_id) values (p_profile, p_report, n, step, sid);
  perform app.notify(p_profile, 'violation_' || step, jsonb_build_object('case_no', r.case_no, 'rule', r.rule, 'step', n));
  if n >= 4 then
    perform app.notify(a.profile_id, 'violation_review', jsonb_build_object('profile_id', p_profile)) from public.server_admins a;
  end if;
end $$;

-- ───────────────────────── reports ─────────────────────────
create or replace function app.create_report(p_type text, p_target uuid, p_rule public.report_rule, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('report'); author uuid; body text; ctx text; reg uuid; rid uuid; cid uuid; num text; juror record;
        emerg boolean; quarantine boolean := false; dismissed int; upheld int;
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
    when 'resource' then
      select r.owner_id, r.title || coalesce(E'\n' || r.url, '') || coalesce(E'\n' || r.description, ''), r.region_id into author, body, reg
        from public.resources r where r.id = p_target and app.resource_level(r.id) >= 1;
    else raise exception 'invalid_target';
  end case;
  if author is null then raise exception 'not_found'; end if;
  if author = me then raise exception 'own_content'; end if;
  if exists (select 1 from public.reports where reporter_id = me and target_type = p_type and target_id = p_target) then
    raise exception 'already_reported';
  end if;
  -- people whose reports were mostly turned down are slowed down: two a day
  select count(*) filter (where status = 'dismissed'), count(*) filter (where status = 'upheld') into dismissed, upheld
    from public.reports where reporter_id = me and created_at > now() - interval '30 days';
  if dismissed >= app.param('report_poor_min') and dismissed > 2 * upheld
     and (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 day') >= 2 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;
  reg := coalesce(reg, (select home_region_id from public.profiles where id = me));
  emerg := p_rule::text in ('illegal', 'child_safety', 'threat') and p_type <> 'message';
  quarantine := emerg or (p_type = 'resource' and exists (select 1 from public.resources where id = p_target and origin = 'file'));
  num := to_char(now(), 'YYYY') || '-' || lpad(nextval('private.case_no_seq')::text, 4, '0');
  insert into public.reports (reporter_id, target_type, target_id, target_author_id, rule, note, case_no, emergency, quarantined)
  values (me, p_type, p_target, author, p_rule, nullif(trim(p_note), ''), num, emerg, quarantine) returning id into rid;
  -- what may be dangerous or illegal is hidden at once, files wait unreadable for the decision
  if quarantine then
    case p_type
      when 'post' then update public.posts set hidden_at = coalesce(hidden_at, now()) where id = p_target;
      when 'argument' then update public.arguments set hidden_at = coalesce(hidden_at, now()) where id = p_target;
      when 'argument_reply' then update public.argument_replies set hidden_at = coalesce(hidden_at, now()) where id = p_target;
      when 'listing' then update public.listings set status = 'closed' where id = p_target and status = 'active';
      when 'resource' then update public.resources set hidden_at = coalesce(hidden_at, now()) where id = p_target;
      else null;
    end case;
  end if;
  if emerg then
    perform app.notify(a.profile_id, 'emergency_review', jsonb_build_object('report_id', rid, 'case_no', num, 'rule', p_rule))
      from public.server_admins a;
    perform app.notify(author, 'emergency_hidden', jsonb_build_object('case_no', num, 'rule', p_rule));
    return num;
  end if;
  insert into public.jury_cases (report_id, case_no, region_id, context_text, target_text)
  values (rid, num, reg, ctx, body) returning id into cid;
  -- Seven jurors by lot, preferring people from the same area. Not from the groups or chats of the people involved.
  for juror in
    select p.id from public.profiles p
    where p.id not in (me, author) and app.profile_is_verified(p.id) and p.onboarded_at is not null
      and not app.shares_group(p.id, author) and not app.shares_group(p.id, me)
      and not exists (select 1 from public.conversation_participants a join public.conversation_participants b on b.conversation_id = a.conversation_id
                      where a.profile_id = p.id and b.profile_id in (me, author))
    order by (case when reg is not null and exists (
                select 1 from public.user_regions ur where ur.profile_id = p.id and ur.region_id = reg) then 0 else 1 end),
             random()
    limit 7
  loop
    insert into public.jury_seats (case_id, juror_id) values (cid, juror.id);
    perform app.notify(juror.id, 'jury_invite', jsonb_build_object('case_id', cid, 'case_no', num));
  end loop;
  update public.jury_cases set jury_size = greatest(1, (select count(*) from public.jury_seats where case_id = cid)) where id = cid;
  return num;
end $$;

create or replace function app.unhide_target(p_type text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  case p_type
    when 'post' then update public.posts set hidden_at = null where id = p_target and hidden_by is null;
    when 'argument' then update public.arguments set hidden_at = null where id = p_target;
    when 'argument_reply' then update public.argument_replies set hidden_at = null where id = p_target;
    when 'listing' then update public.listings set status = 'active' where id = p_target and status = 'closed';
    when 'resource' then update public.resources set hidden_at = null where id = p_target;
    else null;
  end case;
end $$;

create or replace function app.hide_target(p_type text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  case p_type
    when 'post' then update public.posts set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    when 'argument' then update public.arguments set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    when 'argument_reply' then update public.argument_replies set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    when 'listing' then update public.listings set status = 'closed' where id = p_target;
    when 'resource' then update public.resources set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    when 'message' then perform app.erase_message(p_target, null);
    else null;
  end case;
end $$;

-- The first round decides about the content; a successful appeal in the second round takes it all back.
create or replace function app.resolve_case(p_case uuid, p_status public.report_status) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.jury_cases; r public.reports;
begin
  select * into c from public.jury_cases where id = p_case for update;
  if c.status <> 'open' then return; end if;
  select * into r from public.reports where id = c.report_id;
  update public.jury_cases set status = p_status, decided_at = now() where id = p_case;
  if c.round = 1 then
    update public.reports set status = p_status, quarantined = false where id = r.id;
    if p_status = 'upheld' then
      perform app.hide_target(r.target_type, r.target_id);
      perform app.apply_violation(r.target_author_id, r.id);
      perform app.notify(r.target_author_id, 'content_hidden', jsonb_build_object('case_no', c.case_no, 'rule', r.rule, 'appeal_days', app.param('appeal_days')));
    elsif r.quarantined then
      perform app.unhide_target(r.target_type, r.target_id);
    end if;
    perform app.notify(r.reporter_id, 'report_decided', jsonb_build_object('case_no', r.case_no, 'status', p_status, 'rule', r.rule));
  else
    if p_status = 'dismissed' then
      perform app.unhide_target(r.target_type, r.target_id);
      update public.sanctions set lifted_at = now() where id in (select sanction_id from public.violations where report_id = r.id and sanction_id is not null) and lifted_at is null;
      update public.violations set revoked_at = now() where report_id = r.id and revoked_at is null;
      update public.reports set status = 'dismissed' where id = r.id;
    end if;
    perform app.notify(r.target_author_id, 'appeal_decided', jsonb_build_object('case_no', r.case_no, 'accepted', p_status = 'dismissed'));
  end if;
end $$;

-- A platform admin decides an emergency report.
create or replace function app.decide_emergency(p_report uuid, p_upheld boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('moderate_platform'); r public.reports;
begin
  select * into r from public.reports where id = p_report and emergency and status = 'open' for update;
  if not found then raise exception 'not_found'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'reason_required'; end if;
  update public.reports set status = case when p_upheld then 'upheld'::public.report_status else 'dismissed'::public.report_status end,
         quarantined = false, reviewed_by = me, reviewed_at = now() where id = p_report;
  if p_upheld then
    perform app.hide_target(r.target_type, r.target_id);
    perform app.apply_violation(r.target_author_id, r.id);
    perform app.notify(r.target_author_id, 'content_hidden', jsonb_build_object('case_no', r.case_no, 'rule', r.rule, 'appeal_days', app.param('appeal_days')));
  else
    perform app.unhide_target(r.target_type, r.target_id);
    perform app.notify(r.target_author_id, 'emergency_cleared', jsonb_build_object('case_no', r.case_no));
  end if;
  perform app.notify(r.reporter_id, 'report_decided', jsonb_build_object('case_no', r.case_no, 'status', case when p_upheld then 'upheld' else 'dismissed' end, 'rule', r.rule));
  insert into public.admin_actions (kind) values ('emergency_decided');
  perform app.audit('emergency_decided', 'report', p_report, null, jsonb_build_object('upheld', p_upheld, 'reason', p_reason));
end $$;

-- One appeal for the person concerned; a second jury, with other people, looks at the same question again.
create or replace function app.appeal_report(p_report uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.reports; c1 public.jury_cases; decided timestamptz; cid uuid; num text; juror record; ctx text; tgt text;
begin
  select * into r from public.reports where id = p_report;
  if not found or r.target_author_id is distinct from me then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'upheld' then raise exception 'wrong_phase'; end if;
  select * into c1 from public.jury_cases where report_id = p_report and round = 1;
  decided := coalesce(c1.decided_at, r.reviewed_at);
  if decided is null or decided < now() - make_interval(days => app.param('appeal_days')) then raise exception 'appeal_window_over'; end if;
  if exists (select 1 from public.appeals where report_id = p_report) then raise exception 'duplicate'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'reason_required'; end if;
  num := r.case_no || '-E';
  ctx := c1.context_text; tgt := c1.target_text;
  insert into public.jury_cases (report_id, case_no, region_id, context_text, target_text, round, appeal_of)
  values (p_report, num, c1.region_id, ctx, tgt, 2, c1.id) returning id into cid;
  insert into public.appeals (report_id, appellant_id, reason, appeal_case_id) values (p_report, me, trim(p_reason), cid);
  for juror in
    select p.id from public.profiles p
    where p.id not in (me, r.reporter_id) and app.profile_is_verified(p.id) and p.onboarded_at is not null
      and not exists (select 1 from public.jury_seats s join public.jury_cases jc on jc.id = s.case_id where jc.report_id = p_report and s.juror_id = p.id)
      and not app.shares_group(p.id, me) and not app.shares_group(p.id, r.reporter_id)
    order by random() limit 7
  loop
    insert into public.jury_seats (case_id, juror_id) values (cid, juror.id);
    perform app.notify(juror.id, 'jury_invite', jsonb_build_object('case_id', cid, 'case_no', num));
  end loop;
  update public.jury_cases set jury_size = greatest(1, (select count(*) from public.jury_seats where case_id = cid)) where id = cid;
  return num;
end $$;

-- ───────────────────────── retention and transparency ─────────────────────────
create or replace function app.moderation_tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reports where status <> 'open' and created_at < now() - make_interval(months => app.param('retention_months'));
  delete from public.violations where created_at < now() - make_interval(months => app.param('violation_months'));
  delete from public.sanctions where coalesce(ends_at, lifted_at, starts_at) < now() - make_interval(months => app.param('violation_months'));
  delete from public.chat_access where expires_at < now() - interval '30 days';
end $$;

-- The yearly report: numbers only.
create or replace function app.transparency(p_year int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'year', p_year,
    'reports', (select count(*) from public.reports where extract(year from created_at) = p_year),
    'upheld', (select count(*) from public.reports where extract(year from created_at) = p_year and status = 'upheld'),
    'dismissed', (select count(*) from public.reports where extract(year from created_at) = p_year and status = 'dismissed'),
    'emergency', (select count(*) from public.reports where extract(year from created_at) = p_year and emergency),
    'by_rule', coalesce((select jsonb_object_agg(rule, n) from (select rule::text, count(*) n from public.reports where extract(year from created_at) = p_year group by 1) x), '{}'::jsonb),
    'appeals', (select count(*) from public.appeals where extract(year from created_at) = p_year),
    'appeals_won', (select count(*) from public.appeals a join public.reports r on r.id = a.report_id where extract(year from a.created_at) = p_year and r.status = 'dismissed'),
    'violations', coalesce((select jsonb_object_agg(outcome, n) from (select outcome, count(*) n from public.violations where extract(year from created_at) = p_year group by 1) x), '{}'::jsonb),
    'admin_actions', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from public.admin_actions where extract(year from created_at) = p_year group by 1) x), '{}'::jsonb),
    'disclosures', (select count(*) from public.legal_disclosures where extract(year from created_at) = p_year))
$$;

-- Giving data to an authority needs a court order; every case is logged here, without names.
create or replace function app.log_disclosure(p_reference text, p_authority text, p_scope text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('admin');
begin
  if char_length(coalesce(trim(p_reference), '')) < 3 or char_length(coalesce(trim(p_authority), '')) < 3 or char_length(coalesce(trim(p_scope), '')) < 5 then
    raise exception 'invalid' using errcode = '23514';
  end if;
  insert into public.legal_disclosures (reference, authority, scope, created_by) values (trim(p_reference), trim(p_authority), trim(p_scope), me);
  insert into public.admin_actions (kind) values ('disclosure');
end $$;

-- ───────────────────────── server admins: two sets of eyes ─────────────────────────
-- The change itself. Called only from the functions below.
create or replace function app.execute_admin_action(p_kind text, p_subject uuid, p_reason text, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.initiatives; sid uuid;
begin
  case p_kind
    when 'grant_admin' then perform app.admin_grant(p_subject, true);
    when 'revoke_admin' then
      if (select count(*) from public.server_admins) <= 1 then raise exception 'last_admin'; end if;
      perform app.admin_grant(p_subject, false);
    when 'ban' then
      insert into public.sanctions (profile_id, kind, reason, created_by) values (p_subject, 'ban', left(p_reason, 300), p_by) returning id into sid;
      perform app.notify(p_subject, 'platform_ban', jsonb_build_object('reason', left(p_reason, 300)));
    when 'unban' then
      update public.sanctions set lifted_at = now() where profile_id = p_subject and kind = 'ban' and lifted_at is null;
    when 'block_initiative' then
      select * into i from public.initiatives where id = p_subject for update;
      if not found then raise exception 'not_found'; end if;
      perform app.drop_open_ballot(p_subject, p_reason, 'initiative_ballot_cancelled');
      update public.initiatives set blocked_at = now(), blocked_reason = p_reason where id = p_subject;
      perform app.notify(a.profile_id, 'initiative_blocked', jsonb_build_object('initiative_id', i.id, 'title', i.title, 'reason', p_reason))
        from public.initiative_authors a where a.initiative_id = p_subject;
    when 'unblock_initiative' then
      select * into i from public.initiatives where id = p_subject for update;
      if not found then raise exception 'not_found'; end if;
      update public.initiatives set blocked_at = null, blocked_reason = null where id = p_subject;
      perform app.notify(a.profile_id, 'initiative_unblocked', jsonb_build_object('initiative_id', i.id, 'title', i.title))
        from public.initiative_authors a where a.initiative_id = p_subject;
    when 'chat_access' then
      insert into public.chat_access (conversation_id, admin_id, reason, expires_at)
      values (p_subject, p_by, p_reason, now() + make_interval(mins => app.param('chat_access_minutes')));
      perform app.notify(cp.profile_id, 'emergency_access', '{}'::jsonb) from public.conversation_participants cp where cp.conversation_id = p_subject;
    else raise exception 'invalid' using errcode = '23514';
  end case;
  insert into public.admin_actions (kind) values (p_kind);
  perform app.audit('admin_' || p_kind, 'admin', null, null, jsonb_build_object('subject', p_subject, 'reason', p_reason));
end $$;

-- With more than one admin a second admin has to agree. With one, the single admin acts (and it is logged).
create or replace function app.admin_action(p_kind text, p_subject uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('admin'); pid uuid;
begin
  if p_kind not in ('grant_admin', 'revoke_admin', 'ban', 'unban', 'block_initiative', 'unblock_initiative', 'chat_access') then raise exception 'invalid' using errcode = '23514'; end if;
  if p_kind in ('ban', 'block_initiative', 'chat_access') and char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'reason_required'; end if;
  if p_kind = 'chat_access' and char_length(trim(p_reason)) < 20 then raise exception 'reason_required'; end if;
  if (select count(*) from public.server_admins) < 2 then
    perform app.execute_admin_action(p_kind, p_subject, trim(coalesce(p_reason, '')), me);
    return 'done';
  end if;
  insert into public.admin_proposals (kind, subject_id, reason, proposed_by) values (p_kind, p_subject, trim(coalesce(p_reason, '')), me) returning id into pid;
  perform app.notify(a.profile_id, 'admin_proposal', jsonb_build_object('proposal_id', pid, 'kind', p_kind)) from public.server_admins a where a.profile_id <> me;
  return 'pending';
end $$;

create or replace function app.decide_admin_proposal(p_proposal uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('admin'); pr public.admin_proposals;
begin
  select * into pr from public.admin_proposals where id = p_proposal and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if pr.proposed_by = me then raise exception 'second_admin_needed' using errcode = '42501'; end if;
  if p_approve then perform app.execute_admin_action(pr.kind, pr.subject_id, pr.reason, pr.proposed_by); end if;
  update public.admin_proposals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = me, decided_at = now() where id = p_proposal;
end $$;

-- Replaces the one-person block of stage 4: blocking an initiative needs a second admin once there are two.
drop function if exists app.block_initiative(uuid, text, boolean);
create or replace function app.block_initiative(p_init uuid, p_reason text, p_on boolean default true) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_action('moderate_platform');
  if not exists (select 1 from public.initiatives where id = p_init) then raise exception 'not_found'; end if;
  if p_on and char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'reason_required'; end if;
  return app.admin_action(case when p_on then 'block_initiative' else 'unblock_initiative' end, p_init, p_reason);
end $$;

-- Emergency access to a chat: only after an approved request, for an hour, and everybody in the chat is told.
create or replace function app.emergency_messages(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('admin');
begin
  if not exists (select 1 from public.chat_access where conversation_id = p_conversation and admin_id = me and expires_at > now()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.admin_actions (kind) values ('chat_read');
  return coalesce((select jsonb_agg(jsonb_build_object('sender', p.display_name, 'body', m.body, 'at', m.created_at) order by m.created_at)
                     from (select * from public.messages where conversation_id = p_conversation order by created_at desc limit 200) m
                     join public.profiles p on p.id = m.sender_id), '[]'::jsonb);
end $$;

-- What the admin page needs.
create or replace function app.admin_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.server_admins where profile_id = app.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'proposals', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'kind', pr.kind, 'reason', pr.reason, 'mine', pr.proposed_by = app.uid(), 'at', pr.created_at,
                  'subject', coalesce((select display_name from public.profiles where id = pr.subject_id), (select title from public.initiatives where id = pr.subject_id), pr.subject_id::text)) order by pr.created_at)
                  from public.admin_proposals pr where pr.status = 'pending'), '[]'::jsonb),
    'emergencies', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'case_no', r.case_no, 'rule', r.rule, 'type', r.target_type, 'note', r.note, 'at', r.created_at,
                  'text', coalesce((select body from public.posts where id = r.target_id), (select body from public.arguments where id = r.target_id),
                                    (select body from public.argument_replies where id = r.target_id), (select title from public.listings where id = r.target_id),
                                    (select title from public.resources where id = r.target_id))) order by r.created_at)
                  from public.reports r where r.emergency and r.status = 'open'), '[]'::jsonb),
    'admins', (select count(*) from public.server_admins),
    'disclosures', coalesce((select jsonb_agg(jsonb_build_object('reference', d.reference, 'authority', d.authority, 'at', d.created_at) order by d.created_at desc)
                  from (select * from public.legal_disclosures order by created_at desc limit 20) d), '[]'::jsonb));
end $$;

-- ───────────────────────── the clock ─────────────────────────
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
  return n;
end $$;

grant select on public.reports to authenticated;
grant execute on function app.transparency(int) to anon, authenticated, hivevoice_server;
grant execute on function app.create_report(text, uuid, public.report_rule, text), app.decide_emergency(uuid, boolean, text), app.appeal_report(uuid, text),
  app.log_disclosure(text, text, text), app.admin_action(text, uuid, text), app.decide_admin_proposal(uuid, boolean), app.block_initiative(uuid, text, boolean),
  app.emergency_messages(uuid), app.admin_queue()
  to authenticated, hivevoice_server;
