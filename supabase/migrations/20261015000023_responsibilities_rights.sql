-- Rights, stage 5: responsibilities ("Zuständige").
--   three visible levels (self-declared, confirmed by the community, official),
--   a limit for self-declarations and a word list for titles that sound like an office,
--   disputes with 14 days for evidence and then a jury from the region,
--   hand-over with acceptance, substitutes, vacancy after 60 days, answer target of 14 days,
--   the requester may forward or mark an overdue request, official roles belong to the role
--   (several people with the agency mail, confirmed again every 12 months).

-- ───────────────────────── numbers and limits ─────────────────────────
insert into public.rule_params (key, value, description) values
  ('resp_confirm_min', 5, 'People of the region who must confirm a responsibility to make it community-confirmed'),
  ('resp_self_max', 3, 'Self-declared responsibilities per person'),
  ('resp_target_days', 14, 'Days a responsible person should need to answer'),
  ('resp_notice_days', 30, 'Days without an answer before a notice shows'),
  ('resp_vacant_days', 60, 'Days without an answer before a responsibility counts as vacant'),
  ('resp_dispute_days', 14, 'Days for evidence in a dispute'),
  ('resp_jury_days', 7, 'Days the jury has in a dispute'),
  ('resp_dispute_cooldown', 30, 'Days before the same person may dispute the same responsibility again'),
  ('resp_reconfirm_months', 12, 'Months an official role stays confirmed'),
  ('resp_transfer_days', 14, 'Days a hand-over stays open')
on conflict (key) do nothing;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values
  ('responsibility_request', 2, null, 10, 24),
  ('responsibility_dispute', 2, null, 3, 24),
  ('responsibility_confirm', 2, null, 30, 24)
on conflict (action) do nothing;

-- ───────────────────────── columns ─────────────────────────
alter table public.responsibilities
  add column state text not null default 'active' check (state in ('active', 'pending_official', 'withdrawn')),
  add column substitute_id uuid references public.profiles(id) on delete set null,
  add column substitute_until date,
  add column vacant_at timestamptz,
  add column reconfirm_due date,
  add column reconfirm_notified_at timestamptz;
update public.responsibilities set reconfirm_due = (official_verified_at + interval '12 months')::date
 where is_official and official_verified_at is not null;
grant select (state, substitute_id, substitute_until, vacant_at, reconfirm_due) on public.responsibilities to anon, authenticated;

alter table public.responsibility_requests add column unanswered_at timestamptz;
grant select on public.responsibility_requests to anon, authenticated;
alter table private.official_verifications add column profile_id uuid references public.profiles(id) on delete cascade;

-- ───────────────────────── holders and history ─────────────────────────
create table public.responsibility_holders (
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  since timestamptz not null default now(),
  primary key (responsibility_id, profile_id)
);
insert into public.responsibility_holders (responsibility_id, profile_id) select id, holder_id from public.responsibilities on conflict do nothing;
alter table public.responsibility_holders enable row level security;
create policy read_all on public.responsibility_holders for select using (true);
grant select on public.responsibility_holders to anon, authenticated;

create table public.responsibility_history (
  id bigint generated always as identity primary key,
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  kind text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  by_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.responsibility_history (responsibility_id, created_at desc);
alter table public.responsibility_history enable row level security;
create policy read_all on public.responsibility_history for select using (true);
grant select on public.responsibility_history to anon, authenticated;
insert into public.responsibility_history (responsibility_id, kind, profile_id, created_at)
  select id, 'created', holder_id, created_at from public.responsibilities;

create table public.responsibility_confirmations (
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (responsibility_id, profile_id)
);
alter table public.responsibility_confirmations enable row level security;
create policy own on public.responsibility_confirmations for select to authenticated using (profile_id = app.uid());
grant select on public.responsibility_confirmations to authenticated;

create table public.responsibility_endorsements (
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  by_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (responsibility_id, group_id)
);
alter table public.responsibility_endorsements enable row level security;
create policy read_all on public.responsibility_endorsements for select using (true);
grant select on public.responsibility_endorsements to anon, authenticated;

-- ───────────────────────── who is responsible ─────────────────────────
create or replace function app.is_resp_holder(p_resp uuid, p_profile uuid default app.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responsibility_holders where responsibility_id = p_resp and profile_id = p_profile)
      or exists (select 1 from public.responsibilities r where r.id = p_resp and r.substitute_id = p_profile
                 and (r.substitute_until is null or r.substitute_until >= current_date))
$$;

create or replace function app.responsibility_level(p_resp uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.is_official then 'official'
    when (select count(*) from public.responsibility_confirmations c where c.responsibility_id = r.id) >= app.param('resp_confirm_min')
         or exists (select 1 from public.responsibility_endorsements e where e.responsibility_id = r.id) then 'community'
    else 'self' end
  from public.responsibilities r where r.id = p_resp
$$;

create or replace function app.resp_confirm_count(p_resp uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.responsibility_confirmations where responsibility_id = p_resp
$$;

create or replace function app.resp_confirmed_by_me(p_resp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responsibility_confirmations where responsibility_id = p_resp and profile_id = app.uid())
$$;

create or replace function app.resp_unanswered(p_resp uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.responsibility_requests where responsibility_id = p_resp and status = 'open' and unanswered_at is not null
$$;

-- Titles and organisations that sound like an office need the confirmation from an official mail address.
create or replace function app.sounds_official(p_text text) returns boolean
language sql immutable as $$
  select lower(coalesce(p_text, '')) ~ '(bürgermeister|landrat|ministerium|minister|referat|behörde|polizei|stadtverwaltung|gemeindeverwaltung|kreisverwaltung|landesverwaltung|bezirksverwaltung|rathaus|bezirksausschuss|stadtrat|gemeinderat|regierung|staatskanzlei|bundesamt|landesamt|senat)'
      or lower(coalesce(p_text, '')) ~ '(^|[^a-zäöüß])([a-zäöüß]{3,}amt|amt)([^a-zäöüß]|$)'
$$;

-- ───────────────────────── creating and editing ─────────────────────────
create or replace function app.save_responsibility(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid := nullif(p ->> 'id', '')::uuid; ttl text := trim(coalesce(p ->> 'title', ''));
        org text := nullif(trim(coalesce(p ->> 'organization_name', '')), ''); descr text := trim(coalesce(p ->> 'description', ''));
        official_like boolean; old public.responsibilities; still_official boolean;
begin
  if char_length(ttl) < 2 then raise exception 'title_required'; end if;
  if char_length(descr) < 5 then raise exception 'body_required'; end if;
  perform app.require_real_name();
  official_like := app.sounds_official(ttl || ' ' || coalesce(org, ''));
  if rid is null then
    perform app.require_action('responsibility_self');
    if (select count(*) from public.responsibilities r where r.holder_id = me and r.state <> 'withdrawn' and app.responsibility_level(r.id) = 'self')
       >= app.param('resp_self_max') then
      raise exception 'too_many_responsibilities';
    end if;
    insert into public.responsibilities (holder_id, title, organization_name, description, region_id, state)
    values (me, ttl, org, descr, nullif(p ->> 'region_id', '')::uuid, case when official_like then 'pending_official' else 'active' end)
    returning id into rid;
    insert into public.responsibility_holders (responsibility_id, profile_id) values (rid, me);
    insert into public.responsibility_history (responsibility_id, kind, profile_id, by_id) values (rid, 'created', me, me);
  else
    select * into old from public.responsibilities where id = rid and holder_id = me;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
    -- changing an official title or organisation needs a new confirmation
    still_official := old.is_official and old.title = ttl and old.organization_name is not distinct from org;
    update public.responsibilities set title = ttl, organization_name = org, description = descr,
           region_id = nullif(p ->> 'region_id', '')::uuid, is_official = still_official,
           state = case when old.state = 'withdrawn' then 'withdrawn' when still_official then 'active'
                        when official_like then 'pending_official' else 'active' end
     where id = rid;
    delete from public.responsibility_tags where responsibility_id = rid;
  end if;
  insert into public.responsibility_tags (responsibility_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'))))) on conflict do nothing;
  return rid;
end $$;

-- People who live in the place confirm that the declaration is right; or a group of the place recommends it.
create or replace function app.confirm_responsibility(p_resp uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('responsibility_confirm'); r public.responsibilities; before_level text; after_level text;
begin
  select * into r from public.responsibilities where id = p_resp and state = 'active';
  if not found then raise exception 'not_found'; end if;
  if app.is_resp_holder(p_resp, me) then raise exception 'own_responsibility'; end if;
  if r.region_id is null or not exists (select 1 from public.user_regions where profile_id = me and region_id = r.region_id) then
    raise exception 'not_affected' using errcode = '42501';
  end if;
  before_level := app.responsibility_level(p_resp);
  if p_on then
    insert into public.responsibility_confirmations (responsibility_id, profile_id) values (p_resp, me) on conflict do nothing;
  else
    delete from public.responsibility_confirmations where responsibility_id = p_resp and profile_id = me;
  end if;
  after_level := app.responsibility_level(p_resp);
  if before_level = 'self' and after_level = 'community' then
    perform app.notify(h.profile_id, 'responsibility_confirmed', jsonb_build_object('responsibility_id', r.id, 'title', r.title))
      from public.responsibility_holders h where h.responsibility_id = p_resp;
  end if;
end $$;

create or replace function app.recommend_responsibility(p_resp uuid, p_group uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.responsibilities; g public.groups;
begin
  select * into r from public.responsibilities where id = p_resp and state = 'active';
  if not found then raise exception 'not_found'; end if;
  select * into g from public.groups where id = p_group;
  if not found or not exists (select 1 from public.group_members m where m.group_id = p_group and m.profile_id = me and m.role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_on then
    if g.visibility <> 'public' or g.archived_at is not null or g.member_count < 5 or r.region_id is null or g.region_id is null
       or not (g.region_id = r.region_id or r.region_id in (select app.region_ancestors(g.region_id))) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    insert into public.responsibility_endorsements (responsibility_id, group_id, by_id) values (p_resp, p_group, me) on conflict do nothing;
  else
    delete from public.responsibility_endorsements where responsibility_id = p_resp and group_id = p_group;
  end if;
end $$;

-- ───────────────────────── official confirmation (the role, not the person) ─────────────────────────
create or replace function app.start_official_verification(p_profile uuid, p_responsibility uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare dom text := lower(split_part(p_email, '@', 2)); matched text; token text; r public.responsibilities;
begin
  select * into r from public.responsibilities where id = p_responsibility;
  if not found then raise exception 'not_found'; end if;
  select d.domain into matched from public.official_domains d
   where dom = d.domain or dom like '%.' || d.domain order by length(d.domain) desc limit 1;
  if matched is null then raise exception 'domain_not_official'; end if;
  -- the holder confirms; somebody else may join an official role with a mail address of the same agency
  if not app.is_resp_holder(p_responsibility, p_profile)
     and not (r.is_official and r.state = 'active' and r.official_domain is not null and (dom = r.official_domain::text or dom like '%.' || r.official_domain::text)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.official_verifications (responsibility_id, email, token_hash, expires_at, profile_id)
  values (p_responsibility, p_email, sha256(convert_to(token, 'UTF8')), now() + interval '2 days', p_profile);
  return token;
end $$;

create or replace function app.confirm_official_verification(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v private.official_verifications; dom text; joined boolean;
begin
  select * into v from private.official_verifications
   where token_hash = sha256(convert_to(p_token, 'UTF8')) and confirmed_at is null and expires_at > now();
  if not found then raise exception 'invalid_token'; end if;
  update private.official_verifications set confirmed_at = now() where id = v.id;
  dom := lower(split_part(v.email, '@', 2));
  update public.responsibilities set is_official = true, official_domain = dom, official_verified_at = now(),
         state = 'active', reconfirm_due = (current_date + make_interval(months => app.param('resp_reconfirm_months')))::date,
         reconfirm_notified_at = null
   where id = v.responsibility_id;
  if v.profile_id is not null then
    joined := not exists (select 1 from public.responsibility_holders where responsibility_id = v.responsibility_id and profile_id = v.profile_id);
    insert into public.responsibility_holders (responsibility_id, profile_id) values (v.responsibility_id, v.profile_id) on conflict do nothing;
    insert into public.responsibility_history (responsibility_id, kind, profile_id, by_id)
      values (v.responsibility_id, case when joined then 'joined' else 'confirmed' end, v.profile_id, v.profile_id);
  end if;
  return v.responsibility_id;
end $$;

-- Somebody of an official role leaves; the role stays with the others.
create or replace function app.leave_responsibility(p_resp uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.responsibilities; next_holder uuid;
begin
  select * into r from public.responsibilities where id = p_resp;
  if not found or not exists (select 1 from public.responsibility_holders where responsibility_id = p_resp and profile_id = me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select profile_id into next_holder from public.responsibility_holders where responsibility_id = p_resp and profile_id <> me order by since limit 1;
  if next_holder is null then raise exception 'last_holder'; end if;
  delete from public.responsibility_holders where responsibility_id = p_resp and profile_id = me;
  if r.holder_id = me then update public.responsibilities set holder_id = next_holder where id = p_resp; end if;
  insert into public.responsibility_history (responsibility_id, kind, profile_id, by_id) values (p_resp, 'left', me, me);
end $$;

-- ───────────────────────── hand-over and substitutes ─────────────────────────
create table public.responsibility_transfers (
  id uuid primary key default gen_random_uuid(),
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index on public.responsibility_transfers (responsibility_id) where status = 'proposed';
alter table public.responsibility_transfers enable row level security;
create policy involved on public.responsibility_transfers for select to authenticated using (from_id = app.uid() or to_id = app.uid());
grant select on public.responsibility_transfers to authenticated;

create or replace function app.propose_responsibility_transfer(p_resp uuid, p_to uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.responsibilities; tid uuid;
begin
  select * into r from public.responsibilities where id = p_resp and holder_id = me;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.is_official then raise exception 'official_role'; end if;
  if p_to = me or not app.profile_is_verified(p_to) then raise exception 'invalid' using errcode = '23514'; end if;
  insert into public.responsibility_transfers (responsibility_id, from_id, to_id) values (p_resp, me, p_to) returning id into tid;
  perform app.notify(p_to, 'responsibility_transfer', jsonb_build_object('transfer_id', tid, 'title', r.title,
    'by', (select display_name from public.profiles where id = me)));
  return tid;
end $$;

create or replace function app.decide_responsibility_transfer(p_transfer uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); t public.responsibility_transfers; r public.responsibilities;
begin
  select * into t from public.responsibility_transfers where id = p_transfer and to_id = me and status = 'proposed' for update;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.responsibilities where id = t.responsibility_id;
  if p_accept then
    perform app.require_real_name();
    if r.holder_id <> t.from_id then raise exception 'not_found'; end if;
    update public.responsibilities set holder_id = me, substitute_id = null, substitute_until = null, vacant_at = null where id = r.id;
    delete from public.responsibility_holders where responsibility_id = r.id and profile_id = t.from_id;
    insert into public.responsibility_holders (responsibility_id, profile_id) values (r.id, me) on conflict do nothing;
    insert into public.responsibility_history (responsibility_id, kind, profile_id, by_id) values (r.id, 'handover', me, t.from_id);
    update public.responsibility_transfers set status = 'accepted', decided_at = now() where id = t.id;
  else
    update public.responsibility_transfers set status = 'declined', decided_at = now() where id = t.id;
  end if;
  perform app.notify(t.from_id, 'responsibility_transfer_answer', jsonb_build_object('title', r.title, 'accepted', p_accept,
    'name', (select display_name from public.profiles where id = me)));
end $$;

create or replace function app.cancel_responsibility_transfer(p_transfer uuid) returns void
language sql security definer set search_path = '' as $$
  update public.responsibility_transfers set status = 'cancelled', decided_at = now()
   where id = p_transfer and from_id = app.uid() and status = 'proposed'
$$;

create or replace function app.set_substitute(p_resp uuid, p_sub uuid, p_until date) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.responsibilities;
begin
  select * into r from public.responsibilities where id = p_resp;
  if not found or not app.is_resp_holder(p_resp, me) or r.substitute_id = me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_sub is null or p_sub = me or p_until is null or p_until <= current_date or p_until > current_date + 366 or not app.profile_is_verified(p_sub) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  update public.responsibilities set substitute_id = p_sub, substitute_until = p_until where id = p_resp;
  perform app.notify(p_sub, 'responsibility_substitute', jsonb_build_object('title', r.title, 'until', p_until,
    'by', (select display_name from public.profiles where id = me)));
end $$;

create or replace function app.clear_substitute(p_resp uuid) returns void
language sql security definer set search_path = '' as $$
  update public.responsibilities set substitute_id = null, substitute_until = null
   where id = p_resp and (substitute_id = app.uid() or exists (select 1 from public.responsibility_holders h where h.responsibility_id = id and h.profile_id = app.uid()))
$$;

-- ───────────────────────── requests ─────────────────────────
create or replace function app.trg_request_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify(x.profile_id, 'responsibility_request', jsonb_build_object('request_id', new.id))
    from (select profile_id from public.responsibility_holders where responsibility_id = new.responsibility_id
          union select substitute_id from public.responsibilities
                 where id = new.responsibility_id and substitute_id is not null and (substitute_until is null or substitute_until >= current_date)) x;
  return null;
end $$;

create or replace function app.create_request(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid; rid uuid; resp uuid := (p ->> 'responsibility_id')::uuid; initiative uuid := nullif(p ->> 'initiative_id', '')::uuid;
begin
  if char_length(coalesce(trim(p ->> 'body'), '')) < 10 then raise exception 'body_required'; end if;
  if not exists (select 1 from public.responsibilities where id = resp and state = 'active') then raise exception 'not_found'; end if;
  me := app.require_action('responsibility_request');
  if app.is_resp_holder(resp, me) then raise exception 'own_responsibility'; end if;
  insert into public.responsibility_requests (responsibility_id, initiative_id, group_id, listing_id, author_id, body, due_at)
  values (resp, initiative, nullif(p ->> 'group_id', '')::uuid, nullif(p ->> 'listing_id', '')::uuid, me, trim(p ->> 'body'),
          case when initiative is not null then now() + interval '6 weeks' else now() + make_interval(days => app.param('resp_target_days')) end)
  returning id into rid;
  return rid;
end $$;

create or replace function app.respond_request(p_request uuid, p_decision public.resp_decision, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); r public.responsibility_requests; days int;
begin
  select * into r from public.responsibility_requests where id = p_request;
  if not found then raise exception 'not_found'; end if;
  if not app.is_resp_holder(r.responsibility_id, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p_body), '')) < 5 then raise exception 'body_required'; end if;
  update public.responsibility_requests
     set status = 'answered', decision = p_decision, response_body = trim(p_body), responded_by = me, responded_at = now()
   where id = p_request;
  select round(avg(extract(epoch from responded_at - created_at) / 86400))::int into days
    from public.responsibility_requests where responsibility_id = r.responsibility_id and responded_at is not null;
  update public.responsibilities set avg_response_days = days, vacant_at = null where id = r.responsibility_id;
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
  select * into r from public.responsibility_requests where id = p_request and status = 'open';
  if not found or not app.is_resp_holder(r.responsibility_id, me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.responsibilities where id = p_to and state = 'active') then raise exception 'not_found'; end if;
  update public.responsibility_requests set status = 'forwarded', forwarded_to_id = p_to, response_body = p_note,
         responded_by = me, responded_at = now() where id = p_request;
  insert into public.responsibility_requests (responsibility_id, initiative_id, group_id, listing_id, author_id, body)
  values (p_to, r.initiative_id, r.group_id, r.listing_id, r.author_id, r.body);
  perform app.notify(r.author_id, 'request_forwarded', jsonb_build_object('request_id', r.id));
end $$;

-- After the target time the person who asked may send the request to somebody else ...
create or replace function app.redirect_request(p_request uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('responsibility_request'); r public.responsibility_requests;
begin
  select * into r from public.responsibility_requests where id = p_request and author_id = me and status = 'open' for update;
  if not found then raise exception 'not_found'; end if;
  if r.due_at > now() then raise exception 'not_overdue'; end if;
  if p_to = r.responsibility_id or not exists (select 1 from public.responsibilities where id = p_to and state = 'active') or app.is_resp_holder(p_to, me) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  update public.responsibility_requests set status = 'forwarded', forwarded_to_id = p_to, responded_at = now(),
         response_body = 'Von der anfragenden Person weitergeleitet, weil keine Antwort kam.' where id = p_request;
  insert into public.responsibility_requests (responsibility_id, initiative_id, group_id, listing_id, author_id, body)
  values (p_to, r.initiative_id, r.group_id, r.listing_id, r.author_id, r.body);
end $$;

-- ... or have it shown as unanswered on the page of the responsible person.
create or replace function app.mark_unanswered(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); r public.responsibility_requests;
begin
  select * into r from public.responsibility_requests where id = p_request and author_id = me and status = 'open' for update;
  if not found then raise exception 'not_found'; end if;
  if r.due_at > now() then raise exception 'not_overdue'; end if;
  if r.unanswered_at is not null then return; end if;
  update public.responsibility_requests set unanswered_at = now() where id = p_request;
  perform app.notify(h.profile_id, 'responsibility_unanswered', jsonb_build_object('request_id', r.id))
    from public.responsibility_holders h where h.responsibility_id = r.responsibility_id;
end $$;

-- ───────────────────────── disputes ─────────────────────────
create table public.responsibility_disputes (
  id uuid primary key default gen_random_uuid(),
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  raised_by uuid not null references public.profiles(id) on delete cascade,
  claim text not null,
  status text not null default 'evidence' check (status in ('evidence', 'jury', 'upheld', 'dismissed')),
  evidence_until timestamptz not null,
  jury_until timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index on public.responsibility_disputes (responsibility_id) where status in ('evidence', 'jury');
create table public.responsibility_dispute_statements (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.responsibility_disputes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create table public.responsibility_dispute_seats (
  dispute_id uuid not null references public.responsibility_disputes(id) on delete cascade,
  juror_id uuid not null references public.profiles(id) on delete cascade,
  invited_at timestamptz not null default now(),
  declined boolean not null default false,
  choice text check (choice in ('ok', 'not_ok')),
  reason text,
  decided_at timestamptz,
  primary key (dispute_id, juror_id)
);
alter table public.responsibility_disputes enable row level security;
alter table public.responsibility_dispute_statements enable row level security;
alter table public.responsibility_dispute_seats enable row level security;
create policy read_all on public.responsibility_disputes for select using (true);
create policy read_all on public.responsibility_dispute_statements for select using (true);
create policy own on public.responsibility_dispute_seats for select to authenticated using (juror_id = app.uid());
grant select on public.responsibility_disputes, public.responsibility_dispute_statements to anon, authenticated;
grant select on public.responsibility_dispute_seats to authenticated;

create or replace function app.dispute_responsibility(p_resp uuid, p_claim text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('responsibility_dispute'); r public.responsibilities; did uuid;
begin
  select * into r from public.responsibilities where id = p_resp and state = 'active';
  if not found then raise exception 'not_found'; end if;
  if r.is_official then raise exception 'official_role'; end if;       -- the check of the mail domain decides
  if app.is_resp_holder(p_resp, me) then raise exception 'own_responsibility'; end if;
  if char_length(coalesce(trim(p_claim), '')) < 10 then raise exception 'body_required'; end if;
  if exists (select 1 from public.responsibility_disputes where responsibility_id = p_resp and raised_by = me and status = 'dismissed'
             and decided_at > now() - make_interval(days => app.param('resp_dispute_cooldown'))) then
    raise exception 'cooldown';
  end if;
  insert into public.responsibility_disputes (responsibility_id, raised_by, claim, evidence_until)
  values (p_resp, me, trim(p_claim), now() + make_interval(days => app.param('resp_dispute_days'))) returning id into did;
  insert into public.responsibility_dispute_statements (dispute_id, author_id, body) values (did, me, trim(p_claim));
  perform app.notify(h.profile_id, 'responsibility_dispute', jsonb_build_object('dispute_id', did, 'title', r.title))
    from public.responsibility_holders h where h.responsibility_id = p_resp;
  return did;
end $$;

create or replace function app.add_dispute_statement(p_dispute uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); d public.responsibility_disputes;
begin
  select * into d from public.responsibility_disputes where id = p_dispute;
  if not found then raise exception 'not_found'; end if;
  if d.status <> 'evidence' then raise exception 'wrong_phase'; end if;
  if not (d.raised_by = me or app.is_resp_holder(d.responsibility_id, me)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p_body), '')) < 5 then raise exception 'body_required'; end if;
  insert into public.responsibility_dispute_statements (dispute_id, author_id, body) values (p_dispute, me, left(trim(p_body), 2000));
end $$;

create or replace function app.resolve_dispute(p_dispute uuid, p_upheld boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.responsibility_disputes; r public.responsibilities;
begin
  select * into d from public.responsibility_disputes where id = p_dispute and status in ('evidence', 'jury') for update;
  if not found then return; end if;
  select * into r from public.responsibilities where id = d.responsibility_id;
  update public.responsibility_disputes set status = case when p_upheld then 'upheld' else 'dismissed' end, decided_at = now() where id = p_dispute;
  if p_upheld then
    update public.responsibilities set state = 'withdrawn' where id = r.id;
    insert into public.responsibility_history (responsibility_id, kind, by_id) values (r.id, 'withdrawn_by_jury', d.raised_by);
  end if;
  perform app.notify(x.profile_id, 'responsibility_dispute_decided', jsonb_build_object('dispute_id', d.id, 'title', r.title, 'upheld', p_upheld))
    from (select profile_id from public.responsibility_holders where responsibility_id = r.id union select d.raised_by) x;
end $$;

-- After the time for evidence seven people from the region decide whether the declaration is right.
create or replace function app.draw_dispute_jury(p_dispute uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.responsibility_disputes; r public.responsibilities; juror record; n int := 0;
begin
  select * into d from public.responsibility_disputes where id = p_dispute and status = 'evidence' for update;
  if not found then return; end if;
  select * into r from public.responsibilities where id = d.responsibility_id;
  for juror in
    select p.id from public.profiles p
    where p.id <> d.raised_by and not app.is_resp_holder(r.id, p.id) and app.profile_is_verified(p.id) and p.onboarded_at is not null
    order by (case when r.region_id is not null and exists (select 1 from public.user_regions ur where ur.profile_id = p.id and ur.region_id = r.region_id) then 0 else 1 end), random()
    limit 7
  loop
    insert into public.responsibility_dispute_seats (dispute_id, juror_id) values (p_dispute, juror.id);
    perform app.notify(juror.id, 'dispute_jury_invite', jsonb_build_object('dispute_id', p_dispute, 'title', r.title));
    n := n + 1;
  end loop;
  if n = 0 then
    perform app.resolve_dispute(p_dispute, false);
  else
    update public.responsibility_disputes set status = 'jury', jury_until = now() + make_interval(days => app.param('resp_jury_days')) where id = p_dispute;
  end if;
end $$;

create or replace function app.vote_dispute(p_dispute uuid, p_choice text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); seats int; n_ok int; n_not int; need int;
begin
  if p_choice not in ('ok', 'not_ok') then raise exception 'invalid' using errcode = '23514'; end if;
  if not exists (select 1 from public.responsibility_disputes where id = p_dispute and status = 'jury') then raise exception 'wrong_phase'; end if;
  update public.responsibility_dispute_seats set choice = p_choice, reason = nullif(trim(coalesce(p_reason, '')), ''), decided_at = now()
   where dispute_id = p_dispute and juror_id = me and choice is null and not declined;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) filter (where not declined), count(*) filter (where choice = 'ok'), count(*) filter (where choice = 'not_ok')
    into seats, n_ok, n_not from public.responsibility_dispute_seats where dispute_id = p_dispute;
  need := seats / 2 + 1;
  if n_not >= need then perform app.resolve_dispute(p_dispute, true);
  elsif n_ok >= need then perform app.resolve_dispute(p_dispute, false);
  end if;
end $$;

create or replace function app.decline_dispute_jury(p_dispute uuid) returns void
language sql security definer set search_path = '' as $$
  update public.responsibility_dispute_seats set declined = true where dispute_id = p_dispute and juror_id = app.uid() and choice is null
$$;

create or replace function app.dispute_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare d record;
begin
  for d in select id from public.responsibility_disputes where status = 'evidence' and evidence_until < now() loop
    perform app.draw_dispute_jury(d.id);
  end loop;
  for d in
    select rd.id, count(*) filter (where s.choice = 'not_ok') n_not, count(*) filter (where s.choice = 'ok') n_ok
    from public.responsibility_disputes rd left join public.responsibility_dispute_seats s on s.dispute_id = rd.id
    where rd.status = 'jury' and rd.jury_until < now() group by rd.id
  loop
    perform app.resolve_dispute(d.id, d.n_not > d.n_ok);
  end loop;
end $$;

-- ───────────────────────── the clock: vacancy, substitutes, re-confirmation ─────────────────────────
create or replace function app.responsibility_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- no answer for a long time: the responsibility counts as vacant
  update public.responsibilities s set vacant_at = now()
   where s.state = 'active' and s.vacant_at is null
     and exists (select 1 from public.responsibility_requests q where q.responsibility_id = s.id and q.status = 'open'
                 and q.created_at < now() - make_interval(days => app.param('resp_vacant_days')));
  update public.responsibilities set substitute_id = null, substitute_until = null where substitute_until < current_date;
  update public.responsibility_transfers set status = 'cancelled', decided_at = now()
   where status = 'proposed' and created_at < now() - make_interval(days => app.param('resp_transfer_days'));
  -- official roles are confirmed again every year
  for r in select id, title from public.responsibilities
           where is_official and reconfirm_due is not null and reconfirm_due <= current_date + 30 and reconfirm_due >= current_date
             and (reconfirm_notified_at is null or reconfirm_notified_at < now() - interval '25 days') loop
    perform app.notify(h.profile_id, 'responsibility_reconfirm', jsonb_build_object('responsibility_id', r.id, 'title', r.title))
      from public.responsibility_holders h where h.responsibility_id = r.id;
    update public.responsibilities set reconfirm_notified_at = now() where id = r.id;
  end loop;
  for r in select id, title, organization_name from public.responsibilities where is_official and reconfirm_due is not null and reconfirm_due < current_date loop
    update public.responsibilities
       set is_official = false, official_verified_at = null, reconfirm_due = null,
           state = case when app.sounds_official(r.title || ' ' || coalesce(r.organization_name, '')) then 'pending_official' else 'active' end
     where id = r.id;
    insert into public.responsibility_history (responsibility_id, kind) values (r.id, 'lapsed');
    perform app.notify(h.profile_id, 'responsibility_lapsed', jsonb_build_object('responsibility_id', r.id, 'title', r.title))
      from public.responsibility_holders h where h.responsibility_id = r.id;
  end loop;
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
  return n;
end $$;

grant execute on function app.is_resp_holder(uuid, uuid), app.responsibility_level(uuid), app.resp_confirm_count(uuid), app.resp_confirmed_by_me(uuid),
  app.resp_unanswered(uuid), app.sounds_official(text)
  to anon, authenticated, hivevoice_server;
grant execute on function app.save_responsibility(jsonb), app.confirm_responsibility(uuid, boolean), app.recommend_responsibility(uuid, uuid, boolean),
  app.leave_responsibility(uuid), app.propose_responsibility_transfer(uuid, uuid), app.decide_responsibility_transfer(uuid, boolean),
  app.cancel_responsibility_transfer(uuid), app.set_substitute(uuid, uuid, date), app.clear_substitute(uuid),
  app.create_request(jsonb), app.respond_request(uuid, public.resp_decision, text), app.forward_request(uuid, uuid, text),
  app.redirect_request(uuid, uuid), app.mark_unanswered(uuid), app.dispute_responsibility(uuid, text), app.add_dispute_statement(uuid, text),
  app.vote_dispute(uuid, text, text), app.decline_dispute_jury(uuid)
  to authenticated, hivevoice_server;
