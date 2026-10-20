-- Market: offers and requests with a category and its own fields, an offer and a request as one pair (a swap),
-- matching with reasons that both sides see, a reference to one's own listing when asking, and coordinates for the map.
--   category: help, job, housing, item, ride, event, custom (a form the person defines)
--   attrs:    the category's fields (employment, rooms, condition, route, date, own fields ...), validated in the app
--   pair_id:  an offer that expects something in return and the request for that return point at each other

-- ───────────────────────── listings ─────────────────────────
alter table public.listings
  add column if not exists category text not null default 'help'
    check (category in ('help', 'job', 'housing', 'item', 'ride', 'event', 'custom')),
  add column if not exists attrs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attrs) = 'object' and pg_column_size(attrs) < 4000),
  add column if not exists pair_id uuid references public.listings(id) on delete set null,
  add column if not exists search tsvector
    generated always as (to_tsvector('german', title || ' ' || coalesce(description, ''))) stored;

create index if not exists listings_search_idx on public.listings using gin (search);
create index if not exists listings_category_idx on public.listings (kind, category, status);

grant select (category, attrs, pair_id, search) on public.listings to anon, authenticated;

-- An answer to a listing can say which of one's own listings it fits ("passt zu meinem Angebot …").
alter table public.contact_requests add column if not exists via_listing_id uuid references public.listings(id) on delete set null;

-- Municipalities get a centre point for the map (filled by scripts/import-region-coords.mjs).
alter table public.regions add column if not exists lat double precision, add column if not exists lon double precision;

create or replace function app.save_listing(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); lid uuid := nullif(p ->> 'id', '')::uuid; gid uuid := nullif(p ->> 'group_id', '')::uuid;
        cat text := coalesce(nullif(p ->> 'category', ''), 'help'); fields jsonb := coalesce(p -> 'attrs', '{}'::jsonb);
begin
  if gid is not null and not app.profile_has_group_permission(me, gid, 'post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(fields) <> 'object' then raise exception 'invalid' using errcode = '23514'; end if;
  if lid is null then
    insert into public.listings (kind, owner_id, group_id, title, description, details_private, pay_mode, hourly_rate_cents,
                                 fixed_price_cents, swap_text, region_id, location_text, schedule_text, is_recurring, seats,
                                 seeking_allies, status, category, attrs)
    values ((p ->> 'kind')::public.listing_kind, me, gid, trim(p ->> 'title'), p ->> 'description', p ->> 'details_private',
            coalesce((p ->> 'pay_mode')::public.pay_mode, 'free'), nullif(p ->> 'hourly_rate_cents', '')::int,
            nullif(p ->> 'fixed_price_cents', '')::int, nullif(p ->> 'swap_text', ''), nullif(p ->> 'region_id', '')::uuid,
            nullif(p ->> 'location_text', ''), nullif(p ->> 'schedule_text', ''), coalesce((p ->> 'is_recurring')::boolean, false),
            nullif(p ->> 'seats', '')::int, coalesce((p ->> 'seeking_allies')::boolean, false),
            coalesce((p ->> 'status')::public.listing_status, 'active'), cat, fields)
    returning id into lid;
  else
    if not exists (select 1 from public.listings where id = lid and owner_id = me) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.listings set
      title = coalesce(trim(p ->> 'title'), title), description = coalesce(p ->> 'description', description),
      status = coalesce((p ->> 'status')::public.listing_status, status),
      category = coalesce(nullif(p ->> 'category', ''), category), attrs = coalesce(p -> 'attrs', attrs)
    where id = lid;
    delete from public.listing_tags where listing_id = lid and p ? 'tags';
  end if;
  if p ? 'tags' then
    insert into public.listing_tags (listing_id, tag_id)
      select lid, unnest(app.ensure_tags(array(select jsonb_array_elements_text(p -> 'tags')))) on conflict do nothing;
  end if;
  return lid;
end $$;

-- An offer and a request of the same person become one swap: "I give this and look for that in return".
create or replace function app.pair_listings(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified();
begin
  if (select count(distinct kind) from public.listings where id in (p_a, p_b) and owner_id = me) <> 2 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.listings set pair_id = null where pair_id in (p_a, p_b) and id not in (p_a, p_b);
  update public.listings set pair_id = case id when p_a then p_b else p_a end where id in (p_a, p_b);
end $$;

-- ───────────────────────── matching ─────────────────────────
-- Listings of the other kind that fit, with a score and the reasons behind it, so both sides see why.
-- Reasons: tag:<slug>, category, words, place, near, online, deal, employment, route, budget, swap.
-- Runs with the caller's rights: only listings the caller may read are considered.
create or replace function app.listing_matches(p_listing uuid, p_limit int default 12)
returns table (id uuid, score int, reasons text[])
language sql stable set search_path = '' as $$
  with me as (
    select l.id, l.kind, l.owner_id, l.category, l.attrs, l.region_id, l.search, l.fixed_price_cents, l.pay_mode,
           array(select lt.tag_id from public.listing_tags lt where lt.listing_id = l.id) as tags,
           array(select a from app.region_ancestors(l.region_id) a) as up,
           (select r.parent_id from public.regions r where r.id = l.region_id) as parent,
           array(select pt.tag_id from public.listing_tags pt where pt.listing_id = l.pair_id) as pair_tags,
           tsvector_to_array(l.search) as words
    from public.listings l where l.id = p_listing
  ), cand as (
    select o.id, o.created_at,
      array(select t.slug::text from public.listing_tags ot join public.tags t on t.id = ot.tag_id
            where ot.listing_id = o.id and ot.tag_id = any(me.tags) order by t.slug) as shared,
      (select count(*)::int from unnest(tsvector_to_array(o.search)) w where w = any(me.words)) as common,
      o.category = me.category and me.category <> 'custom' as same_cat,
      me.region_id is not null and o.region_id = me.region_id as same_place,
      me.region_id is not null and o.region_id is not null and o.region_id <> me.region_id
        and (o.region_id = any(me.up) or me.region_id = any(array(select a from app.region_ancestors(o.region_id) a))
             or (select r.parent_id from public.regions r where r.id = o.region_id) = me.parent) as near,
      coalesce((o.attrs ->> 'online')::boolean, false) or coalesce((me.attrs ->> 'online')::boolean, false)
        or o.attrs ->> 'remote' = 'remote' or me.attrs ->> 'remote' = 'remote' as online,
      o.category = me.category and o.attrs ->> 'deal' is not null and o.attrs ->> 'deal' = me.attrs ->> 'deal' as deal,
      o.category = 'job' and me.category = 'job' and o.attrs ->> 'employment' is not null and o.attrs ->> 'employment' = me.attrs ->> 'employment' as employment,
      o.category = 'ride' and me.category = 'ride' and lower(trim(o.attrs ->> 'to')) = lower(trim(me.attrs ->> 'to'))
        and coalesce(lower(trim(o.attrs ->> 'from')), '') = coalesce(lower(trim(me.attrs ->> 'from')), '') as route,
      o.category = me.category and o.pay_mode = 'fixed' and me.pay_mode = 'fixed'
        and (case when me.kind = 'need' then o.fixed_price_cents <= me.fixed_price_cents else me.fixed_price_cents <= o.fixed_price_cents end) as budget,
      -- a swap fits both ways: the other person also offers (or asks for) what my pair asks for (or offers)
      cardinality(me.pair_tags) > 0 and exists (
        select 1 from public.listings x join public.listing_tags xt on xt.listing_id = x.id
        where x.owner_id = o.owner_id and x.kind = me.kind and x.status = 'active' and xt.tag_id = any(me.pair_tags)) as swap
    from public.listings o, me
    where o.kind <> me.kind and o.status = 'active' and o.owner_id <> me.owner_id
  ), scored as (
    select c.id, c.created_at,
      (least(cardinality(c.shared), 3) * 3 + least(c.common, 3) * 2 + case when c.same_cat then 2 else 0 end
       + case when c.same_place then 3 when c.near then 1 else 0 end
       + case when c.deal then 2 else 0 end + case when c.employment then 1 else 0 end
       + case when c.route then 4 else 0 end + case when c.budget then 1 else 0 end + case when c.swap then 5 else 0 end)::int as score,
      array_remove(
        array(select 'tag:' || s from unnest(c.shared) s limit 2)
        || array[case when c.route then 'route' end, case when c.swap then 'swap' end,
                 case when c.common > 0 then 'words' end, case when c.same_cat then 'category' end,
                 case when c.deal then 'deal' end, case when c.employment then 'employment' end,
                 case when c.budget then 'budget' end,
                 case when c.same_place then 'place' when c.near then 'near' when c.online then 'online' end], null) as reasons,
      cardinality(c.shared) > 0 or c.common > 0 or c.route as relevant
    from cand c
  )
  select s.id, s.score, s.reasons from scored s
  where s.relevant and s.score >= 3
  order by s.score desc, s.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
$$;

grant execute on function app.listing_matches(uuid, int) to anon, authenticated, hivevoice_server;
grant execute on function app.pair_listings(uuid, uuid) to authenticated, hivevoice_server;

-- New listing: tell the people whose listings fit best (at most five, only good matches, once per pair).
create or replace function app.notify_listing_matches(p_listing uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.uid(); l public.listings; m record; n int := 0;
begin
  select * into l from public.listings where id = p_listing and owner_id = me and status = 'active';
  if not found then return 0; end if;
  for m in select x.id, x.score, o.owner_id, o.title from app.listing_matches(p_listing, 20) x join public.listings o on o.id = x.id
           where x.score >= 6 and not app.is_blocked_between(me, o.owner_id) order by x.score desc loop
    continue when exists (select 1 from public.notifications where profile_id = m.owner_id and kind = 'listing_match'
                          and payload ->> 'listing_id' = p_listing::text and payload ->> 'for_listing_id' = m.id::text);
    perform app.notify(m.owner_id, 'listing_match', jsonb_build_object(
      'listing_id', l.id, 'kind', l.kind, 'title', l.title, 'for_listing_id', m.id, 'for_title', m.title));
    n := n + 1;
    exit when n >= 5;
  end loop;
  return n;
end $$;
grant execute on function app.notify_listing_matches(uuid) to authenticated, hivevoice_server;

-- ───────────────────────── contact with a reference ─────────────────────────
drop function if exists app.request_contact(uuid, text);
create or replace function app.request_contact(p_listing uuid, p_message text, p_via uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_verified(); l public.listings; rid uuid; why text; via uuid;
begin
  select * into l from public.listings where id = p_listing and status = 'active';
  if not found then raise exception 'not_found'; end if;
  if l.owner_id = me then raise exception 'own_listing'; end if;
  why := app.contact_block_reason(me, l.owner_id, true);
  if why is not null then raise exception '%', why using errcode = '42501'; end if;
  if (select count(*) from public.contact_requests where from_profile_id = me and status = 'declined' and decided_at > now() - interval '7 days') >= 3 then
    raise exception 'rate_limited';
  end if;
  -- only one's own active listing of the other kind can be the reference
  select x.id into via from public.listings x where x.id = p_via and x.owner_id = me and x.kind <> l.kind and x.status = 'active';
  insert into public.contact_requests (listing_id, from_profile_id, to_profile_id, message, via_listing_id)
  values (p_listing, me, l.owner_id, left(trim(p_message), 500), via) returning id into rid;
  perform app.notify(l.owner_id, 'contact_request', jsonb_build_object('request_id', rid, 'listing_id', l.id, 'title', l.title));
  return rid;
end $$;
grant execute on function app.request_contact(uuid, text, uuid) to authenticated, hivevoice_server;
