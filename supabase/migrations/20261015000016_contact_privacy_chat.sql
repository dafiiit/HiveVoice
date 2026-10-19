-- Rights, stage 2: who can find and write to whom, blocking and muting, editing and deleting messages,
-- disappearing messages, moderation of posts, real names for public roles, age, and what happens to content when an account goes.

-- ───────────────────── profile: privacy, age, real names ─────────────────────
alter table public.user_settings add column if not exists findable text not null default 'all' check (findable in ('all', 'members', 'groups'));
alter table public.user_settings add column if not exists contact_from text not null default 'all' check (contact_from in ('all', 'verified', 'groups', 'none'));
alter table public.profiles add column if not exists is_minor boolean not null default false;
alter table public.profiles add column if not exists age_confirmed_at timestamptz;
alter table public.profiles add column if not exists display_mode_changed_at timestamptz;
grant select (is_minor) on public.profiles to authenticated;

-- Switching between alias and real name: at most once a month once the profile is set up.
create or replace function app.trg_display_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.onboarded_at is not null and new.display_mode is distinct from old.display_mode then
    if old.display_mode_changed_at is not null and old.display_mode_changed_at > now() - interval '30 days' then
      raise exception 'mode_change_limit' using errcode = 'P0001';
    end if;
    new.display_mode_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists display_mode_limit on public.profiles;
create trigger display_mode_limit before update of display_mode on public.profiles for each row execute function app.trg_display_mode();

-- Public roles (leading a public group, starting an initiative, registering a responsibility) show the real name.
create or replace function app.require_real_name() returns void
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if not exists (select 1 from public.profiles where id = me and display_mode = 'real' and nullif(trim(real_name), '') is not null) then
    raise exception 'real_name_required' using errcode = '42501';
  end if;
end $$;

-- ───────────────────── blocking, muting, hiding ─────────────────────
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on public.blocks (blocked_id);
alter table public.blocks enable row level security;
create policy own on public.blocks for select to authenticated using (blocker_id = app.uid());
grant select on public.blocks to authenticated;

create or replace function app.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function app.block_profile(p_profile uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_profile = me then raise exception 'own_profile'; end if;
  if p_on then
    insert into public.blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
    -- a block ends open requests between the two
    update public.contact_requests set status = 'declined', decided_at = now()
     where status = 'pending' and ((from_profile_id = me and to_profile_id = p_profile) or (from_profile_id = p_profile and to_profile_id = me));
  else
    delete from public.blocks where blocker_id = me and blocked_id = p_profile;
  end if;
end $$;

alter table public.conversation_participants add column if not exists muted boolean not null default false;
alter table public.conversation_participants add column if not exists hidden_at timestamptz;
grant update (last_read_at) on public.conversation_participants to authenticated;

create or replace function app.mute_conversation(p_conversation uuid, p_on boolean) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_participants set muted = p_on where conversation_id = p_conversation and profile_id = app.uid()
$$;

-- "Delete chat" removes it for me only: everything up to now disappears, the chat comes back with the next message.
create or replace function app.hide_conversation(p_conversation uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_participants set hidden_at = now(), last_read_at = now()
   where conversation_id = p_conversation and profile_id = app.uid()
$$;

-- ───────────────────── who may find and write to whom ─────────────────────
create or replace function app.shares_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members x join public.group_members y on y.group_id = x.group_id
                 where x.profile_id = a and y.profile_id = b)
$$;

-- Search and suggestions: may the viewer be shown this person at all?
create or replace function app.can_find(p_viewer uuid, p_target uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare f text;
begin
  if p_viewer is not null and p_viewer = p_target then return true; end if;
  if p_viewer is not null and app.is_blocked_between(p_viewer, p_target) then return false; end if;
  select coalesce((select findable from public.user_settings where profile_id = p_target), 'all') into f;
  return case f when 'all' then true
                when 'members' then p_viewer is not null
                else p_viewer is not null and app.shares_group(p_viewer, p_target) end;
end $$;

-- Null when allowed, otherwise the reason. via_listing: the person answers an offer or request they posted themselves.
create or replace function app.contact_block_reason(p_from uuid, p_to uuid, p_via_listing boolean default false) returns text
language plpgsql stable security definer set search_path = '' as $$
declare s text; minor boolean;
begin
  if app.is_blocked_between(p_from, p_to) then return 'blocked'; end if;
  if exists (select 1 from public.conversation_participants a join public.conversation_participants b on b.conversation_id = a.conversation_id
             where a.profile_id = p_from and b.profile_id = p_to) then return null; end if;
  select is_minor into minor from public.profiles where id = p_to;
  if coalesce(minor, false) and not app.shares_group(p_from, p_to) then return 'minor_protected'; end if;
  if p_via_listing then return null; end if;
  select coalesce((select contact_from from public.user_settings where profile_id = p_to), 'all') into s;
  if s = 'none' then return 'contact_closed'; end if;
  if s = 'verified' and not app.profile_is_verified(p_from) then return 'contact_closed'; end if;
  if s = 'groups' and not app.shares_group(p_from, p_to) then return 'contact_closed'; end if;
  return null;
end $$;

create or replace function app.set_privacy(p_findable text, p_contact_from text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_findable not in ('all', 'members', 'groups') or p_contact_from not in ('all', 'verified', 'groups', 'none') then raise exception 'invalid' using errcode = '23514'; end if;
  -- minors keep the protected settings
  if (select is_minor from public.profiles where id = me) and (p_findable = 'all' or p_contact_from in ('all', 'verified')) then raise exception 'minor_protected' using errcode = '42501'; end if;
  update public.user_settings set findable = p_findable, contact_from = p_contact_from, updated_at = now() where profile_id = me;
end $$;

create or replace function app.request_direct(p_to uuid, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); conv uuid; rid uuid; why text;
begin
  if p_to = me then raise exception 'own_profile'; end if;
  if char_length(coalesce(trim(p_message), '')) < 1 then raise exception 'body_required'; end if;
  if char_length(trim(p_message)) > 500 then raise exception 'invalid' using errcode = '23514'; end if;
  if not exists (select 1 from public.profiles where id = p_to and onboarded_at is not null) then raise exception 'not_found'; end if;
  why := app.contact_block_reason(me, p_to, false);
  if why is not null then raise exception '%', why using errcode = '42501'; end if;
  select c.id into conv from public.conversations c
    join public.conversation_participants a on a.conversation_id = c.id and a.profile_id = me
    join public.conversation_participants b on b.conversation_id = c.id and b.profile_id = p_to
   order by c.last_message_at desc limit 1;
  if conv is not null then return jsonb_build_object('conversation_id', conv); end if;
  select id into rid from public.contact_requests
   where listing_id is null and status = 'pending' and from_profile_id = me and to_profile_id = p_to;
  if rid is not null then return jsonb_build_object('request_id', rid); end if;
  -- three declined requests within a week close the door for a week
  if (select count(*) from public.contact_requests where from_profile_id = me and status = 'declined' and decided_at > now() - interval '7 days') >= 3 then
    raise exception 'rate_limited';
  end if;
  insert into public.contact_requests (from_profile_id, to_profile_id, message)
  values (me, p_to, left(trim(p_message), 500)) returning id into rid;
  perform app.notify(p_to, 'contact_request', jsonb_build_object('request_id', rid));
  return jsonb_build_object('request_id', rid);
end $$;

create or replace function app.request_contact(p_listing uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); l public.listings; rid uuid; why text;
begin
  select * into l from public.listings where id = p_listing and status = 'active';
  if not found then raise exception 'not_found'; end if;
  if l.owner_id = me then raise exception 'own_listing'; end if;
  why := app.contact_block_reason(me, l.owner_id, true);
  if why is not null then raise exception '%', why using errcode = '42501'; end if;
  if (select count(*) from public.contact_requests where from_profile_id = me and status = 'declined' and decided_at > now() - interval '7 days') >= 3 then
    raise exception 'rate_limited';
  end if;
  insert into public.contact_requests (listing_id, from_profile_id, to_profile_id, message)
  values (p_listing, me, l.owner_id, left(trim(p_message), 500)) returning id into rid;
  perform app.notify(l.owner_id, 'contact_request', jsonb_build_object('request_id', rid, 'listing_id', l.id, 'title', l.title));
  return rid;
end $$;

-- ───────────────────── messages: edit, delete, blocked delivery ─────────────────────
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
alter table public.messages add column if not exists undelivered boolean not null default false;

create table public.message_edits (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages(id) on delete cascade,
  body text not null,
  edited_at timestamptz not null default now()
);
create index on public.message_edits (message_id);
alter table public.message_edits enable row level security;
create policy sender on public.message_edits for select to authenticated using (
  exists (select 1 from public.messages m where m.id = message_id and m.sender_id = app.uid()));
grant select on public.message_edits to authenticated;

create table public.message_hidden (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (message_id, profile_id)
);
alter table public.message_hidden enable row level security;
create policy own on public.message_hidden for select to authenticated using (profile_id = app.uid());
grant select on public.message_hidden to authenticated;

-- Messages are readable by the people in the chat, except what they cleared, hid, or what a blocker never received.
drop policy if exists participant on public.messages;
create policy participant on public.messages for select to authenticated using (
  app.is_participant(conversation_id)
  and (not undelivered or sender_id = app.uid())
  and not exists (select 1 from public.message_hidden h where h.message_id = messages.id and h.profile_id = app.uid())
  and created_at > coalesce((select cp.hidden_at from public.conversation_participants cp
                             where cp.conversation_id = messages.conversation_id and cp.profile_id = app.uid()), '-infinity'::timestamptz));

create or replace function app.trg_message_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.conversation_participants cp
             where cp.conversation_id = new.conversation_id and cp.profile_id <> new.sender_id and app.is_blocked_between(cp.profile_id, new.sender_id)) then
    new.undelivered := true;
  end if;
  return new;
end $$;
drop trigger if exists delivery on public.messages;
create trigger delivery before insert on public.messages for each row execute function app.trg_message_delivery();

-- Undelivered messages neither move the chat up nor notify anyone; muted chats do not notify.
create or replace function app.trg_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.undelivered then return null; end if;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
   where conversation_id = new.conversation_id and profile_id = new.sender_id;
  insert into public.notifications (profile_id, kind, payload)
    select cp.profile_id, 'message', jsonb_build_object('conversation_id', new.conversation_id)
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.profile_id <> new.sender_id and not cp.muted
      and not exists (select 1 from public.notifications n where n.profile_id = cp.profile_id and n.kind = 'message'
                      and n.read_at is null and n.payload ->> 'conversation_id' = new.conversation_id::text);
  return null;
end $$;

create or replace function app.edit_message(p_message uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); m public.messages; new_body text := trim(coalesce(p_body, ''));
begin
  select * into m from public.messages where id = p_message and sender_id = me;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.deleted_at is not null then raise exception 'not_found'; end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'edit_window_over' using errcode = '42501'; end if;
  if char_length(new_body) > 5000 then raise exception 'invalid' using errcode = '23514'; end if;
  if new_body = '' and not exists (select 1 from public.attachments where message_id = p_message) and not exists (select 1 from public.polls where message_id = p_message) then
    raise exception 'invalid' using errcode = '23514';
  end if;
  insert into public.message_edits (message_id, body) values (p_message, m.body);
  update public.messages set body = new_body, edited_at = now() where id = p_message;
end $$;

-- Removing a message for everyone empties it and takes its files and poll away. The chat shows "message deleted".
create or replace function app.erase_message(p_message uuid, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages set body = '', deleted_at = now(), deleted_by = p_by where id = p_message and deleted_at is null;
  delete from public.attachments where message_id = p_message;
  delete from public.polls where message_id = p_message;
  delete from public.message_edits where message_id = p_message;
end $$;

create or replace function app.delete_message(p_message uuid, p_for_all boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); m public.messages;
begin
  select * into m from public.messages where id = p_message and app.is_participant(conversation_id);
  if not found then raise exception 'not_found'; end if;
  if p_for_all then
    if m.sender_id <> me then raise exception 'forbidden' using errcode = '42501'; end if;
    perform app.erase_message(p_message, me);
  else
    insert into public.message_hidden (message_id, profile_id) values (p_message, me) on conflict do nothing;
  end if;
end $$;

-- ───────────────────── disappearing messages (both must agree) ─────────────────────
alter table public.conversations add column if not exists ttl_days int check (ttl_days in (7, 30));
alter table public.conversations add column if not exists ttl_proposed_days int check (ttl_proposed_days in (7, 30));
alter table public.conversations add column if not exists ttl_proposed_by uuid references public.profiles(id) on delete set null;

-- p_days null turns it off (either person may); 7 or 30 is a proposal until the other person agrees with the same number.
create or replace function app.propose_ttl(p_conversation uuid, p_days int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); c public.conversations;
begin
  if not app.is_participant(p_conversation) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is not null and p_days not in (7, 30) then raise exception 'invalid' using errcode = '23514'; end if;
  select * into c from public.conversations where id = p_conversation;
  if p_days is null then
    update public.conversations set ttl_days = null, ttl_proposed_days = null, ttl_proposed_by = null where id = p_conversation;
  elsif c.ttl_proposed_days = p_days and c.ttl_proposed_by is distinct from me then
    update public.conversations set ttl_days = p_days, ttl_proposed_days = null, ttl_proposed_by = null where id = p_conversation;
  else
    update public.conversations set ttl_proposed_days = p_days, ttl_proposed_by = me where id = p_conversation;
    perform app.notify(cp.profile_id, 'ttl_proposed', jsonb_build_object('conversation_id', p_conversation, 'days', p_days))
      from public.conversation_participants cp where cp.conversation_id = p_conversation and cp.profile_id <> me;
  end if;
end $$;

create or replace function app.purge_expired_messages() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with gone as (
    delete from public.messages m using public.conversations c
     where c.id = m.conversation_id and c.ttl_days is not null and m.created_at < now() - make_interval(days => c.ttl_days)
     returning 1)
  select count(*) into n from gone;
  return n;
end $$;

-- ───────────────────── posts: moderation, locking, slow mode ─────────────────────
alter table public.posts add column if not exists hidden_by uuid references public.profiles(id) on delete set null;
alter table public.posts add column if not exists hidden_reason text;
alter table public.posts add column if not exists locked boolean not null default false;
alter table public.groups add column if not exists slow_mode_seconds int not null default 0 check (slow_mode_seconds between 0 and 3600);
alter table public.groups add column if not exists adults_only boolean not null default false;
grant update (slow_mode_seconds, adults_only) on public.groups to authenticated;

create or replace function app.is_group_moderator(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.group_role(p_group) in ('admin', 'maintainer')
$$;

create or replace function app.trg_post_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mod boolean := new.group_id is not null and app.is_group_moderator(new.group_id); secs int;
begin
  if new.parent_id is not null and not mod and exists (select 1 from public.posts where id = new.parent_id and locked) then
    raise exception 'locked' using errcode = '42501';
  end if;
  if new.group_id is not null and not mod then
    select slow_mode_seconds into secs from public.groups where id = new.group_id;
    if coalesce(secs, 0) > 0 and exists (select 1 from public.posts where author_id = new.author_id and group_id = new.group_id
                                         and created_at > now() - make_interval(secs => secs)) then
      raise exception 'slow_mode' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists post_rules on public.posts;
create trigger post_rules before insert on public.posts for each row execute function app.trg_post_rules();

create or replace function app.moderate_post(p_post uuid, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); p public.posts;
begin
  select * into p from public.posts where id = p_post;
  if not found then raise exception 'not_found'; end if;
  if p.group_id is null or not app.is_group_moderator(p.group_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  case p_action
    when 'remove' then
      -- the text goes (the group's admins can still read it in the log), the post stays as a visible gap
      update public.posts set body = '', hidden_at = now(), hidden_by = me, hidden_reason = nullif(left(trim(coalesce(p_reason, '')), 300), '') where id = p_post;
      delete from public.attachments where post_id = p_post;
      delete from public.polls where post_id = p_post;
      if p.author_id <> me then
        perform app.notify(p.author_id, 'post_removed', jsonb_build_object('group_id', p.group_id, 'reason', nullif(left(trim(coalesce(p_reason, '')), 300), '')));
      end if;
    when 'pin' then update public.posts set is_pinned = true where id = p_post;
    when 'unpin' then update public.posts set is_pinned = false where id = p_post;
    when 'lock' then update public.posts set locked = true where id = p_post;
    when 'unlock' then update public.posts set locked = false where id = p_post;
    else raise exception 'invalid' using errcode = '23514';
  end case;
  perform app.audit('post_' || p_action, 'post', p_post, p.group_id, jsonb_build_object('reason', p_reason, 'was', case when p_action = 'remove' then p.body end));
end $$;

-- A jury decision about a message empties it, like the person deleting it for everyone.
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
      when 'resource' then update public.resources set hidden_at = now() where id = r.target_id;
      when 'message' then perform app.erase_message(r.target_id, null);
      else null;
    end case;
  end if;
  perform app.notify(r.reporter_id, 'report_decided', jsonb_build_object('case_no', c.case_no, 'status', p_status, 'rule', r.rule));
  if p_status = 'upheld' then
    perform app.notify(r.target_author_id, 'content_hidden', jsonb_build_object('case_no', c.case_no, 'rule', r.rule));
  end if;
end $$;

drop policy if exists read on public.posts;
create policy read on public.posts for select using (
  (hidden_at is null or author_id = app.uid() or hidden_by is not null)
  and (group_id is null or app.can_read_group(group_id)));

-- ───────────────────── onboarding: age, defaults ─────────────────────
create or replace function app.complete_onboarding(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); mode public.display_mode := coalesce((p ->> 'display_mode')::public.display_mode, 'alias');
        rel text; first_time boolean; minor boolean := coalesce((p ->> 'is_minor')::boolean, false);
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select onboarded_at is null into first_time from public.profiles where id = me;
  update public.profiles set
    display_mode = mode,
    real_name = coalesce(nullif(trim(p ->> 'real_name'), ''), real_name),
    alias = coalesce(nullif(trim(p ->> 'alias'), ''), alias),
    display_name = case when mode = 'real' then coalesce(nullif(trim(p ->> 'real_name'), ''), real_name, display_name)
                        else coalesce(nullif(trim(p ->> 'alias'), ''), alias::text, display_name) end,
    is_minor = case when first_time then minor else is_minor end,
    age_confirmed_at = case when first_time and coalesce((p ->> 'age_ok')::boolean, false) then now() else age_confirmed_at end,
    onboarded_at = coalesce(onboarded_at, now()), updated_at = now()
  where id = me;
  if first_time then
    -- aliases and minors start out less visible
    update public.user_settings set findable = case when mode = 'alias' or minor then 'groups' else findable end,
           contact_from = case when minor then 'groups' else contact_from end where profile_id = me;
  end if;
  if nullif(p ->> 'region_id', '') is not null then perform app.set_home_region((p ->> 'region_id')::uuid); end if;
  foreach rel in array array['interest', 'offers', 'needs'] loop
    if p ? rel then
      delete from public.user_interests where profile_id = me and relation = rel;
      insert into public.user_interests (profile_id, tag_id, relation)
        select me, unnest(app.ensure_tags(array(select jsonb_array_elements_text(p -> rel)))), rel on conflict do nothing;
    end if;
  end loop;
end $$;

-- ───────────────────── what stays when an account is deleted ─────────────────────
-- Posts, messages and arguments stay under "Deleted member", personal items go. Group items stay with the group.
insert into public.profiles (id, display_mode, display_name, onboarded_at, is_demo)
values ('00000000-0000-0000-0000-00000000dead', 'alias', 'Gelöschtes Mitglied', now(), false)
on conflict (id) do nothing;
insert into public.user_settings (profile_id, findable, contact_from)
values ('00000000-0000-0000-0000-00000000dead', 'groups', 'none') on conflict (profile_id) do nothing;

create or replace function app.delete_account(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare auth_id uuid; gone constant uuid := '00000000-0000-0000-0000-00000000dead';
begin
  if p_profile = gone then return; end if;
  select auth_user_id into auth_id from public.profiles where id = p_profile;
  delete from public.groups g where g.created_by = p_profile
    and not exists (select 1 from public.group_members m where m.group_id = g.id and m.profile_id <> p_profile);
  -- personal items go
  delete from public.resources where owner_id = p_profile and group_id is null;
  delete from public.listings where owner_id = p_profile;
  -- everything else people may have been answering stays, under the placeholder
  update public.posts set author_id = gone where author_id = p_profile;
  update public.messages set sender_id = gone where sender_id = p_profile;
  update public.arguments set author_id = gone where author_id = p_profile;
  update public.argument_replies set author_id = gone where author_id = p_profile;
  update public.resources set owner_id = gone where owner_id = p_profile;
  update public.attachments set owner_id = gone where owner_id = p_profile;
  delete from public.profiles where id = p_profile;
  if auth_id is not null then delete from auth.users where id = auth_id; end if;
end $$;

grant execute on function app.can_find(uuid, uuid), app.contact_block_reason(uuid, uuid, boolean), app.shares_group(uuid, uuid),
  app.is_blocked_between(uuid, uuid), app.is_group_moderator(uuid) to anon, authenticated, hivevoice_server;
grant execute on function app.block_profile(uuid, boolean), app.mute_conversation(uuid, boolean), app.hide_conversation(uuid),
  app.set_privacy(text, text), app.edit_message(uuid, text), app.delete_message(uuid, boolean), app.propose_ttl(uuid, int),
  app.moderate_post(uuid, text, text), app.request_direct(uuid, text), app.request_contact(uuid, text),
  app.complete_onboarding(jsonb), app.require_real_name() to authenticated, hivevoice_server;
