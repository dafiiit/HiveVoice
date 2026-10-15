-- HiveVoice schema v0.2
-- Portable Postgres (15+). Nothing in this file depends on Supabase.
-- Supabase-specific glue lives in a separate migration.

create extension if not exists citext;

create schema if not exists app;      -- helper and trusted functions
create schema if not exists private;  -- never exposed to clients

-- Roles used by row level security. Supabase already ships them; a plain
-- Postgres gets them here.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- ───────────────────────── enums ─────────────────────────
create type public.region_level as enum ('country', 'state', 'district', 'municipality', 'borough', 'community');
create type public.display_mode as enum ('real', 'alias');
create type public.group_kind as enum ('project', 'club', 'initiative', 'community', 'other');
create type public.visibility as enum ('public', 'members');
create type public.join_policy as enum ('open', 'request');
create type public.group_role as enum ('admin', 'maintainer', 'contributor', 'guest');
create type public.perm_holder as enum ('maintainer', 'contributor', 'guest', 'public');
create type public.group_permission as enum (
  'read', 'post', 'propose_goals', 'vote_goals', 'edit_tasks', 'edit_files',
  'approve_changes', 'manage_members', 'manage_finances', 'archive');
create type public.request_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.goal_status as enum ('voting', 'adopted', 'rejected', 'done');
create type public.task_status as enum ('open', 'in_progress', 'done');
create type public.change_request_status as enum ('open', 'approved', 'changes_requested', 'rejected');
create type public.initiative_phase as enum ('idea', 'debate', 'addressee', 'implementation', 'done');
create type public.initiative_outcome as enum ('rejected_vote', 'rejected_addressee', 'withdrawn');
create type public.argument_side as enum ('pro', 'contra');
create type public.ballot_subject as enum ('initiative', 'goal');
create type public.ballot_status as enum ('open', 'closed', 'cancelled');
create type public.voter_segment as enum ('affected', 'member', 'external');
create type public.listing_kind as enum ('offer', 'need');
create type public.pay_mode as enum ('free', 'hourly', 'fixed', 'swap');
create type public.listing_status as enum ('draft', 'active', 'paused', 'closed');
create type public.funding_status as enum ('draft', 'active', 'succeeded', 'failed', 'cancelled');
create type public.pledge_status as enum ('pledged', 'collected', 'released', 'cancelled');
create type public.report_rule as enum ('insult', 'threat', 'spam', 'misinformation', 'personal_data');
create type public.report_status as enum ('open', 'upheld', 'dismissed');
create type public.jury_choice as enum ('violation', 'no_violation', 'unsure');
create type public.resp_request_status as enum ('open', 'answered', 'forwarded', 'declined');
create type public.resp_decision as enum ('accepted', 'partial', 'rejected', 'info');

-- ───────────────────── federation base ─────────────────────
-- Every instance is authoritative for its own rows (origin_instance_id is null).
-- Rows mirrored from other instances carry their origin and canonical uri.
create table public.instances (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  public_key text,
  trust_level text not null default 'open' check (trust_level in ('open', 'verified', 'blocked')),
  created_at timestamptz not null default now()
);

create table public.federation_outbox (
  id bigint generated always as identity primary key,
  object_type text not null,
  object_id uuid not null,
  activity text not null,           -- Create | Update | Delete
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

-- ───────────────────── settings ─────────────────────
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────── 1 identity and places ─────────────────────
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.regions(id) on delete cascade,
  level public.region_level not null,
  name text not null,
  country_code char(2) not null default 'DE',
  official_code text,                -- AGS / Länderschlüssel / Bezirksnummer
  wikidata_id text,                  -- shared identity across instances
  created_at timestamptz not null default now(),
  unique (country_code, level, official_code)
);
create index on public.regions (parent_id);
create index regions_name_idx on public.regions (lower(name) text_pattern_ops);

create table public.postal_codes (
  code text not null,
  region_id uuid not null references public.regions(id) on delete cascade,
  locality text,
  primary key (code, region_id)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,          -- local login; null for remote and demo profiles
  origin_instance_id uuid references public.instances(id),
  actor_uri text unique,
  display_mode public.display_mode not null default 'alias',
  display_name text not null,
  real_name text,
  alias citext unique,
  avatar_seed int not null default floor(random() * 1000)::int,
  bio text,
  headline text,
  home_region_id uuid references public.regions(id) on delete set null,
  is_verified boolean not null default false,
  verified_by text,                  -- verifier that attested the person (eID provider, instance)
  verified_at timestamptz,
  onboarded_at timestamptz,
  is_demo boolean not null default false,
  helped_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.identities (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  eid_pseudonym_hash bytea not null unique,
  first_name text,
  last_name text,
  is_adult boolean not null,
  residence_region_id uuid references public.regions(id),
  provider text not null,
  attestation jsonb,
  verified_at timestamptz not null default now()
);

create table private.rejoin_blocks (
  eid_pseudonym_hash bytea primary key,
  blocked_until timestamptz not null
);

create table public.user_regions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  source text not null default 'residence' check (source in ('residence', 'community')),
  primary key (profile_id, region_id)
);

create table public.user_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'de',
  easy_language boolean not null default false,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  label text not null,
  kind text not null default 'topic' check (kind in ('topic', 'skill', 'thing', 'money')),
  created_at timestamptz not null default now()
);

create table public.user_interests (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  weight smallint not null default 1 check (weight in (1, 2)),  -- 2 = besonders wichtig
  primary key (profile_id, tag_id)
);

create table public.endorsements (
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_profile_id, to_profile_id),
  check (from_profile_id <> to_profile_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'group', 'initiative', 'responsibility', 'tag')),
  target_id uuid not null,
  target_uri text,                   -- remote objects
  created_at timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);

-- ───────────── 2 responsibilities ("Wer ist zuständig?") ─────────────
-- Anyone can declare what they are responsible for (caretaker, store manager,
-- gardener, an office). Officials prove it with their official email address.
create table public.official_domains (
  domain citext primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table public.responsibilities (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,               -- "Gartenbau Süd", "Hausmeister"
  organization_name text,            -- "Baureferat München"
  description text not null,         -- scope: "Ausstattung und Nutzung im Westpark"
  region_id uuid references public.regions(id) on delete set null,
  is_official boolean not null default false,
  official_domain citext,
  official_verified_at timestamptz,
  avg_response_days int,
  created_at timestamptz not null default now()
);
create index on public.responsibilities (holder_id);
create index on public.responsibilities (region_id);

create table public.responsibility_tags (
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (responsibility_id, tag_id)
);

create table private.official_verifications (
  id uuid primary key default gen_random_uuid(),
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  email citext not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── 3 groups, roles, permissions ─────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  uri text unique,
  origin_instance_id uuid references public.instances(id),
  name text not null,
  summary text,
  description text,
  kind public.group_kind not null default 'project',
  visibility public.visibility not null default 'public',
  join_policy public.join_policy not null default 'request',
  region_id uuid references public.regions(id) on delete set null,
  cover_seed int not null default floor(random() * 7)::int,
  mod_tasks boolean not null default true,
  mod_files boolean not null default false,
  mod_funding boolean not null default false,
  mod_official boolean not null default false,
  member_count int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_tags (
  group_id uuid not null references public.groups(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (group_id, tag_id)
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null default 'contributor',
  focus text,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index on public.group_members (profile_id);

create table public.group_role_permissions (
  group_id uuid not null references public.groups(id) on delete cascade,
  holder public.perm_holder not null,
  permission public.group_permission not null,
  allowed boolean not null,
  primary key (group_id, holder, permission)
);

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null default 'request' check (direction in ('request', 'invite')),
  proposed_role public.group_role not null default 'contributor',
  message text,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index group_join_requests_pending_idx on public.group_join_requests (group_id, profile_id) where status = 'pending';

-- ───────────── 4 goals, tasks, files ─────────────
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  parent_goal_id uuid references public.goals(id) on delete cascade,
  title text not null,
  description text,
  status public.goal_status not null default 'voting',
  timeline text,
  due_date date,
  done boolean not null default false,  -- for sub-goals
  proposed_by uuid references public.profiles(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  adopted_at timestamptz
);
create index on public.goals (group_id);

create table public.goal_owners (
  goal_id uuid not null references public.goals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (goal_id, profile_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  title text not null,
  status public.task_status not null default 'open',
  due_date date,
  hourly_rate_cents int,
  position int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.tasks (group_id);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

-- Files with versions and change requests: schema ready, UI follows later.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  tool text,
  current_version int not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  version_no int not null,
  storage_key text not null,         -- S3-compatible object key
  size_bytes bigint,
  message text,
  author_id uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (file_id, version_no)
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  base_version_id uuid references public.file_versions(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  proposed_storage_key text not null,
  status public.change_request_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── 5 civic initiatives and debate ─────────────
create table public.initiatives (
  id uuid primary key default gen_random_uuid(),
  uri text unique,
  origin_instance_id uuid references public.instances(id),
  group_id uuid references public.groups(id) on delete set null,
  title text not null,
  summary text,
  body text,
  body_easy text,                    -- Leichte Sprache
  region_id uuid not null references public.regions(id),
  phase public.initiative_phase not null default 'idea',
  outcome public.initiative_outcome,
  addressee_responsibility_id uuid references public.responsibilities(id) on delete set null,
  addressee_text text,               -- free text when the addressee is not on HiveVoice
  cost_estimate_cents bigint,
  cover_seed int not null default floor(random() * 7)::int,
  support_count int not null default 0,
  argument_count int not null default 0,
  thread_count int not null default 0,
  response_due_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.initiatives (region_id);
create index on public.initiatives (phase);

create table public.initiative_authors (
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (initiative_id, profile_id)
);

create table public.initiative_tags (
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (initiative_id, tag_id)
);

create table public.initiative_supports (
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (initiative_id, profile_id)
);

create table public.initiative_revisions (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  editor_id uuid references public.profiles(id) on delete set null,
  note text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.responsibility_requests (
  id uuid primary key default gen_random_uuid(),
  responsibility_id uuid not null references public.responsibilities(id) on delete cascade,
  initiative_id uuid references public.initiatives(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  listing_id uuid,                   -- fk added below
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  due_at timestamptz not null default now() + interval '6 weeks',
  status public.resp_request_status not null default 'open',
  decision public.resp_decision,
  response_body text,
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  forwarded_to_id uuid references public.responsibilities(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.responsibility_requests (responsibility_id);
create index on public.responsibility_requests (initiative_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  uri text unique,
  origin_instance_id uuid references public.instances(id),
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  initiative_id uuid references public.initiatives(id) on delete cascade,
  region_id uuid references public.regions(id) on delete cascade,  -- "Marktplatz" of a place
  parent_id uuid references public.posts(id) on delete cascade,
  repost_of uuid references public.posts(id) on delete cascade,
  listing_id uuid,                   -- card link, fk added below
  body text not null,
  need_tag_id uuid references public.tags(id) on delete set null,
  is_pinned boolean not null default false,
  score int not null default 0,
  reply_count int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(body) between 1 and 5000)
);
create index on public.posts (group_id, created_at desc);
create index on public.posts (initiative_id, created_at desc);
create index on public.posts (region_id, created_at desc);
create index on public.posts (parent_id);

create table public.post_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (post_id, profile_id)
);

create table public.arguments (
  id uuid primary key default gen_random_uuid(),
  uri text unique,
  origin_instance_id uuid references public.instances(id),
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  side public.argument_side not null,
  body text not null check (char_length(body) between 10 and 2000),
  sources jsonb not null default '[]'::jsonb,
  author_id uuid not null references public.profiles(id) on delete cascade,
  from_post_id uuid references public.posts(id) on delete set null,
  support_count int not null default 0,
  reply_count int not null default 0,
  bridge_score numeric(4,3) not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.arguments (initiative_id);

create table public.argument_supports (
  argument_id uuid not null references public.arguments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (argument_id, profile_id)
);

create table public.argument_replies (
  id uuid primary key default gen_random_uuid(),
  argument_id uuid not null references public.arguments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── 6 ballots (secret) ─────────────
create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  subject_type public.ballot_subject not null,
  initiative_id uuid references public.initiatives(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  question text not null,
  options jsonb not null default '["yes","no","abstain"]'::jsonb,
  eligible_region_id uuid references public.regions(id),
  quorum_pct smallint not null default 0,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status public.ballot_status not null default 'open',
  result jsonb,                      -- written once at close; blind until then
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((subject_type = 'initiative' and initiative_id is not null) or (subject_type = 'goal' and goal_id is not null))
);
create index on public.ballots (status, closes_at);

create table public.ballot_participation (
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  segment public.voter_segment not null,
  voted_at timestamptz not null default now(),
  primary key (ballot_id, profile_id)
);

create table private.ballot_votes (
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  voter_token bytea not null,        -- HMAC(server key, profile_id || ballot_id): change, never reveal
  segment public.voter_segment not null,
  choice text not null,
  primary key (ballot_id, voter_token)
);

-- ───────────── 7 requests and offers ─────────────
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  uri text unique,
  origin_instance_id uuid references public.instances(id),
  kind public.listing_kind not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  title text not null check (char_length(title) between 3 and 200),
  description text,
  details_private text,              -- visible only after contact is accepted
  cover_seed int,
  pay_mode public.pay_mode not null default 'free',
  hourly_rate_cents int,
  fixed_price_cents int,
  swap_text text,
  region_id uuid references public.regions(id) on delete set null,
  location_text text,
  schedule_text text,
  is_recurring boolean not null default false,
  seats int,
  seeking_allies boolean not null default false,
  ally_count int not null default 0,
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now()
);
create index on public.listings (kind, status, region_id);
create index on public.listings (owner_id);
create index on public.listings (group_id);

alter table public.responsibility_requests add foreign key (listing_id) references public.listings(id) on delete cascade;
alter table public.posts add foreign key (listing_id) references public.listings(id) on delete set null;

create table public.listing_tags (
  listing_id uuid not null references public.listings(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (listing_id, tag_id)
);

create table public.listing_allies (
  listing_id uuid not null references public.listings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, profile_id)
);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_profile_id <> to_profile_id)
);
create unique index contact_requests_pending_idx on public.contact_requests (listing_id, from_profile_id) where status = 'pending';

-- ───────────── 8 private conversations ─────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_request_id uuid references public.contact_requests(id) on delete set null,
  title text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index on public.conversation_participants (profile_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

-- ───────────── 9 funding (schema ready, UI follows later) ─────────────
create table public.funding_campaigns (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  initiative_id uuid references public.initiatives(id) on delete cascade,
  goal_amount_cents bigint not null,
  purpose text not null,
  surplus_rule text,
  deadline timestamptz not null,
  status public.funding_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pledges (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.funding_campaigns(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  status public.pledge_status not null default 'pledged',
  payment_ref text,
  created_at timestamptz not null default now()
);

-- ───────────── 10 moderation: reports and citizen jury ─────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'argument', 'argument_reply', 'listing', 'message')),
  target_id uuid not null,
  target_uri text,
  target_author_id uuid references public.profiles(id) on delete set null,
  rule public.report_rule not null,
  note text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.jury_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  case_no text not null unique,
  region_id uuid references public.regions(id) on delete set null,
  jury_size smallint not null default 7,
  status public.report_status not null default 'open',
  context_text text,                 -- anonymised snapshot for jurors
  target_text text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.jury_seats (
  case_id uuid not null references public.jury_cases(id) on delete cascade,
  juror_id uuid not null references public.profiles(id) on delete cascade,
  invited_at timestamptz not null default now(),
  declined boolean not null default false,
  choice public.jury_choice,
  reason text,
  decided_at timestamptz,
  primary key (case_id, juror_id)
);
create index on public.jury_seats (juror_id);

-- ───────────── 11 personal ─────────────
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (profile_id, created_at desc);

-- ───────────── server administration ─────────────
create table public.server_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
