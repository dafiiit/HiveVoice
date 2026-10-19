-- Rights, stage 8: growth and protection against bots.
--   registration mode (open or by invitation), invitation codes that grow back, the inviter is a "voucher" for the first 30 days,
--   disposable mail domains are not accepted, identical messages and link floods from new accounts are stopped,
--   and a view of where in a place somebody is still missing.

insert into public.app_settings (key, value) values ('registration_mode', '"open"') on conflict do nothing;
create or replace function app.registration_mode() returns text
language sql stable as $$ select coalesce(app.setting('registration_mode') #>> '{}', 'open') $$;

insert into public.rule_params (key, value, description) values
  ('invite_base', 5, 'Invitation codes every person gets'),
  ('invite_max', 50, 'Most invitation codes one person can have'),
  ('invite_code_days', 30, 'Days an invitation code stays valid'),
  ('invite_voucher_days', 30, 'Days the inviter counts as voucher for the invited person'),
  ('invite_active_days', 14, 'Days an invited person has to stay for the inviter to get another code'),
  ('spam_repeat_max', 4, 'The same long message at most this often in an hour'),
  ('spam_links_new_max', 3, 'Messages with links per hour from an account younger than a day')
on conflict (key) do nothing;

insert into public.action_rules (action, min_level, limit_l1, limit_l2, window_hours) values
  ('invite_try', 1, 20, 20, 24),
  ('invite_code', 2, null, 10, 24)
on conflict (action) do nothing;

-- ───────────────────────── who came in with an invitation ─────────────────────────
alter table public.profiles add column if not exists invite_redeemed_at timestamptz;
update public.profiles set invite_redeemed_at = coalesce(invite_redeemed_at, created_at);
-- While registration is open, a new account needs no code.
create or replace function app.trg_profile_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.invite_redeemed_at is null and app.registration_mode() = 'open' then new.invite_redeemed_at := now(); end if;
  return new;
end $$;
drop trigger if exists invite_default on public.profiles;
create trigger invite_default before insert on public.profiles for each row execute function app.trg_profile_invite();

create table public.invite_codes (
  code text primary key check (code ~ '^[A-Z2-9]{10}$'),
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index on public.invite_codes (owner_id);
alter table public.invite_codes enable row level security;
create policy own on public.invite_codes for select to authenticated using (owner_id = app.uid());
grant select on public.invite_codes to authenticated;

-- A level 2 needs, in the invitation phase, a code or two vouches (the same vouches as in the vouch mode).
create or replace function app.trust_level_in_mode(p_profile uuid, p_mode text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; ok boolean; invited boolean;
begin
  if p_profile is null then return 0; end if;
  select * into pr from public.profiles where id = p_profile;
  if not found then return 0; end if;
  if exists (select 1 from public.server_admins where profile_id = p_profile) then return 4; end if;
  if pr.origin_instance_id is not null then return 1; end if;
  ok := pr.is_verified
        or (p_mode = 'login' and pr.auth_user_id is not null)
        or (p_mode = 'vouch' and pr.auth_user_id is not null and pr.created_at < now() - interval '24 hours'
            and (select count(*) from public.vouches v where v.vouched_id = p_profile) >= 2);
  invited := pr.invite_redeemed_at is not null or app.registration_mode() = 'open'
             or (select count(*) from public.vouches v where v.vouched_id = p_profile) >= 2;
  if ok and not invited and not coalesce(pr.is_verified, false) then ok := false; end if;
  if ok and exists (select 1 from public.responsibilities r
                    where r.holder_id = p_profile and r.is_official and r.official_verified_at > now() - interval '12 months') then
    return 3;
  end if;
  return case when ok then 2 else 1 end;
end $$;

create or replace function app.invite_quota(p_profile uuid) returns int
language sql stable security definer set search_path = '' as $$
  select least(app.param('invite_max'), app.param('invite_base') + (
    select count(*)::int from public.profiles i
     where i.invited_by = p_profile and i.invited_at < now() - make_interval(days => app.param('invite_active_days')) and i.onboarded_at is not null))
$$;

create or replace function app.invites_left(p_profile uuid default app.uid()) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(0, app.invite_quota(p_profile) - (
    select count(*)::int from public.invite_codes c
     where c.owner_id = p_profile and c.revoked_at is null and (c.used_by is not null or c.expires_at > now())))
$$;

create or replace function app.new_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text := ''; i int;
begin
  b := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'));
  for i in 0..9 loop c := c || substr(alphabet, 1 + (get_byte(b, i) % 32), 1); end loop;
  return c;
end $$;

create or replace function app.create_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('invite_code'); c text;
begin
  if app.invites_left(me) < 1 then raise exception 'no_invites_left'; end if;
  c := app.new_invite_code();
  insert into public.invite_codes (code, owner_id, expires_at) values (c, me, now() + make_interval(days => app.param('invite_code_days')));
  return c;
end $$;

create or replace function app.revoke_invite_code(p_code text) returns void
language sql security definer set search_path = '' as $$
  update public.invite_codes set revoked_at = now() where code = upper(trim(p_code)) and owner_id = app.uid() and used_by is null and revoked_at is null
$$;

create or replace function app.redeem_invite_code(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_action('invite_try'); c public.invite_codes; pr public.profiles;
begin
  select * into pr from public.profiles where id = me;
  if pr.invite_redeemed_at is not null then raise exception 'already_member'; end if;
  select * into c from public.invite_codes where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found or c.used_by is not null or c.revoked_at is not null or c.expires_at <= now() or c.owner_id = me then raise exception 'invite_invalid'; end if;
  update public.invite_codes set used_by = me, used_at = now() where code = c.code;
  update public.profiles set invited_by = c.owner_id, invited_at = now(), invite_redeemed_at = now() where id = me;
  perform app.notify(c.owner_id, 'invite_used', jsonb_build_object('name', pr.display_name));
end $$;

-- Codes from the admins when nobody inside can invite yet.
create or replace function app.mint_invite_codes(p_count int) returns text[]
language plpgsql security definer set search_path = '' as $$
declare codes text[] := '{}'; c text; i int;
begin
  perform app.require_action('admin');
  if p_count < 1 or p_count > 50 then raise exception 'invalid' using errcode = '23514'; end if;
  for i in 1..p_count loop
    c := app.new_invite_code();
    insert into public.invite_codes (code, owner_id, expires_at) values (c, null, now() + make_interval(days => app.param('invite_code_days')));
    codes := codes || c;
  end loop;
  insert into public.admin_actions (kind) values ('invite_mint');
  return codes;
end $$;

-- Who the person invited lately (the inviter counts as voucher for 30 days; this is not public).
create or replace function app.my_invitees() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'since', p.invited_at) order by p.invited_at desc), '[]'::jsonb)
    from public.profiles p where p.invited_by = app.uid() and p.invited_at > now() - make_interval(days => app.param('invite_voucher_days'))
$$;

-- A violation of somebody who was invited in the last 30 days also reaches the one who invited them.
create or replace function app.apply_violation(p_profile uuid, p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n int; step text; sid uuid; r public.reports; inviter uuid;
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
  select invited_by into inviter from public.profiles where id = p_profile and invited_at > now() - make_interval(days => app.param('invite_voucher_days'));
  if inviter is not null then perform app.notify(inviter, 'invitee_violation', jsonb_build_object('case_no', r.case_no)); end if;
  if n >= 4 then
    perform app.notify(a.profile_id, 'violation_review', jsonb_build_object('profile_id', p_profile)) from public.server_admins a;
  end if;
end $$;

-- ───────────────────────── mail domains and spam patterns ─────────────────────────
create table public.blocked_email_domains (domain text primary key);
alter table public.blocked_email_domains enable row level security;
create policy read_all on public.blocked_email_domains for select using (true);
grant select on public.blocked_email_domains to anon, authenticated;
insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('sharklasers.com'), ('10minutemail.com'), ('10minutemail.net'), ('tempmail.com'),
  ('temp-mail.org'), ('temp-mail.io'), ('yopmail.com'), ('yopmail.fr'), ('trashmail.com'), ('trashmail.de'), ('throwawaymail.com'), ('getnada.com'),
  ('maildrop.cc'), ('dispostable.com'), ('fakeinbox.com'), ('mintemail.com'), ('mytemp.email'), ('tempail.com'), ('tempinbox.com'), ('mohmal.com'),
  ('emailondeck.com'), ('spamgourmet.com'), ('mailnesia.com'), ('burnermail.io'), ('discard.email'), ('einrot.com'), ('wegwerfemail.de'),
  ('wegwerfmail.de'), ('wegwerfmail.net'), ('spambog.com'), ('byom.de'), ('trash-mail.com'), ('trashmail.net'), ('wegwerf-email.de'), ('cuvox.de'),
  ('gustr.com'), ('rhyta.com'), ('teleworm.us'), ('fleckens.hu'), ('jourrapide.com'), ('armyspy.com'), ('dayrep.com')
on conflict do nothing;

create or replace function app.email_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.blocked_email_domains d
                     where lower(split_part(coalesce(p_email, ''), '@', 2)) = d.domain or lower(split_part(coalesce(p_email, ''), '@', 2)) like '%.' || d.domain)
$$;

-- A new account with a disposable address does not get a profile.
create or replace function app.ensure_profile(p_auth_user uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; a text; em text;
begin
  select id into pid from public.profiles where auth_user_id = p_auth_user;
  if pid is not null then return pid; end if;
  select email into em from auth.users where id = p_auth_user;
  if em is not null and not app.email_allowed(em) then raise exception 'email_not_allowed'; end if;
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

-- The same long text sent again and again, or a flood of links from a brand new account, is refused.
create or replace function app.trg_spam_pattern() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid; txt text; n int;
begin
  if tg_table_name = 'messages' then who := new.sender_id; else who := new.author_id; end if;
  if who = '00000000-0000-0000-0000-00000000dead' then return new; end if;
  txt := btrim(coalesce(new.body, ''));
  if char_length(txt) >= 20 then
    select (select count(*) from public.messages where sender_id = who and btrim(body) = txt and created_at > now() - interval '1 hour')
         + (select count(*) from public.posts where author_id = who and btrim(body) = txt and created_at > now() - interval '1 hour') into n;
    if n >= app.param('spam_repeat_max') then raise exception 'spam_detected' using errcode = '53400'; end if;
  end if;
  if txt ~* 'https?://' and exists (select 1 from public.profiles where id = who and created_at > now() - interval '24 hours') then
    select (select count(*) from public.messages where sender_id = who and body ~* 'https?://' and created_at > now() - interval '1 hour')
         + (select count(*) from public.posts where author_id = who and body ~* 'https?://' and created_at > now() - interval '1 hour') into n;
    if n >= app.param('spam_links_new_max') then raise exception 'spam_detected' using errcode = '53400'; end if;
  end if;
  return new;
end $$;
drop trigger if exists spam_messages on public.messages;
create trigger spam_messages before insert on public.messages for each row execute function app.trg_spam_pattern();
drop trigger if exists spam_posts on public.posts;
create trigger spam_posts before insert on public.posts for each row execute function app.trg_spam_pattern();

-- ───────────────────────── where somebody is missing ─────────────────────────
-- Topics people write about in a place for which nobody there has taken on a responsibility yet.
create or replace function app.gaps(p_region uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', slug, 'n', n) order by n desc), '[]'::jsonb) from (
    select t.slug::text as slug, count(*)::int as n
    from (
      select it.tag_id from public.initiative_tags it join public.initiatives i on i.id = it.initiative_id
       where i.published_at is not null and i.outcome is null and i.region_id in (select app.region_ancestors(p_region))
      union all
      select lt.tag_id from public.listing_tags lt join public.listings l on l.id = lt.listing_id
       where l.status = 'active' and l.region_id in (select app.region_ancestors(p_region))
    ) x join public.tags t on t.id = x.tag_id
    where not exists (select 1 from public.responsibility_tags rt join public.responsibilities s on s.id = rt.responsibility_id
                      where rt.tag_id = x.tag_id and s.state = 'active' and s.region_id in (select app.region_ancestors(p_region)))
    group by t.slug order by n desc limit 5) g
$$;

grant execute on function app.registration_mode(), app.email_allowed(text), app.gaps(uuid), app.invite_quota(uuid), app.invites_left(uuid)
  to anon, authenticated, hivevoice_server;
grant execute on function app.create_invite_code(), app.revoke_invite_code(text), app.redeem_invite_code(text), app.mint_invite_codes(int), app.my_invitees()
  to authenticated, hivevoice_server;
