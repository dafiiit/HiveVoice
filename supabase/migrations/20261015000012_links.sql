-- Sharing links: knowledge, files and places kept elsewhere (Drive, Dropbox, GitHub, Figma, Maps, ...).
-- HiveVoice stores only the link and a few preview details, never the file itself.

alter type public.report_rule add value if not exists 'unsafe_link';

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  url text not null check (char_length(url) <= 2000 and url ~ '^https://'),
  host text not null,
  provider text not null default 'web',
  kind text not null default 'page' check (kind in ('document','sheet','slides','form','folder','file','pdf','image','video','code','design','map','dataset','page')),
  title text not null check (char_length(title) between 3 and 200),
  description text check (char_length(description) <= 1000),
  preview jsonb not null default '{}'::jsonb,
  safety text not null default 'checked' check (safety in ('trusted', 'checked', 'caution')),
  safety_notes text[] not null default '{}',
  region_id uuid references public.regions(id) on delete set null,
  score int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, url)
);
create index on public.resources (group_id, created_at desc);
create index on public.resources (score desc, created_at desc);
create index on public.resources (host);
create index on public.resources (region_id);

create table public.resource_tags (
  resource_id uuid not null references public.resources(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (resource_id, tag_id)
);

create table public.resource_votes (
  resource_id uuid not null references public.resources(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (resource_id, profile_id)
);

create or replace function app.trg_resource_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.resources set score = (select coalesce(sum(value), 0) from public.resource_votes where resource_id = coalesce(new.resource_id, old.resource_id))
   where id = coalesce(new.resource_id, old.resource_id);
  return null;
end $$;
create trigger score after insert or update or delete on public.resource_votes for each row execute function app.trg_resource_vote();

alter table public.resources enable row level security;
alter table public.resource_tags enable row level security;
alter table public.resource_votes enable row level security;

create policy read on public.resources for select
  using ((hidden_at is null or owner_id = app.uid()) and (group_id is null or app.can_read_group(group_id)));
create policy edit_own on public.resources for update to authenticated using (owner_id = app.uid()) with check (owner_id = app.uid());
create policy delete on public.resources for delete to authenticated
  using (owner_id = app.uid() or (group_id is not null and app.group_role(group_id) in ('admin', 'maintainer')));
create policy read_all on public.resource_tags for select using (true);
create policy own on public.resource_votes for all to authenticated
  using (profile_id = app.uid()) with check (profile_id = app.uid() and app.is_verified());

grant select on public.resources, public.resource_tags to anon, authenticated;
grant update (title, description) on public.resources to authenticated;
grant delete on public.resources to authenticated;
grant select, insert, update, delete on public.resource_votes to authenticated;

-- Only the app server calls this (it has checked the link); the person must be verified and,
-- for a group, allowed to post there. At most 30 links per person and day.
create or replace function app.share_resource(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); rid uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
begin
  if gid is not null and not app.has_group_permission(gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.resources where owner_id = me and created_at > now() - interval '1 day') >= 30 then raise exception 'rate_limited'; end if;
  if char_length(coalesce(trim(p ->> 'title'), '')) < 3 then raise exception 'title_required'; end if;
  insert into public.resources (owner_id, group_id, url, host, provider, kind, title, description, preview, safety, safety_notes, region_id)
  values (me, gid, p ->> 'url', lower(p ->> 'host'), coalesce(p ->> 'provider', 'web'), coalesce(p ->> 'kind', 'page'),
          left(trim(p ->> 'title'), 200), nullif(left(trim(coalesce(p ->> 'description', '')), 1000), ''),
          coalesce(p -> 'preview', '{}'::jsonb), coalesce(p ->> 'safety', 'checked'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'notes', '[]'::jsonb))), '{}'),
          coalesce(nullif(p ->> 'region_id', '')::uuid, (select home_region_id from public.profiles where id = me)))
  returning id into rid;
  insert into public.resource_tags (resource_id, tag_id)
    select rid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))))) on conflict do nothing;
  return rid;
end $$;
grant execute on function app.share_resource(jsonb) to authenticated, hivevoice_server;

-- Reports and the citizen jury also cover shared links.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'argument', 'argument_reply', 'listing', 'message', 'resource'));

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
    when 'resource' then
      select r.owner_id, r.title || E'\n' || r.url || coalesce(E'\n' || r.description, ''), r.region_id into author, body, reg
        from public.resources r where r.id = p_target;
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
      when 'resource' then update public.resources set hidden_at = now() where id = r.target_id;
      else null;
    end case;
  end if;
  perform app.notify(r.reporter_id, 'report_decided', jsonb_build_object('case_no', c.case_no, 'status', p_status, 'rule', r.rule));
  if p_status = 'upheld' then
    perform app.notify(r.target_author_id, 'content_hidden', jsonb_build_object('case_no', c.case_no, 'rule', r.rule));
  end if;
end $$;
