-- Meaning as a reason only where it stands out: the similarity above this listing's average (calibrated on the demo data).
create or replace function app.listing_matches(p_listing uuid, p_limit int default 12)
returns table (id uuid, score int, reasons text[])
language sql stable set search_path = '' as $$
  with me as (
    select l.id, l.kind, l.owner_id, l.category, l.attrs, l.region_id, l.search, l.fixed_price_cents, l.pay_mode,
           array(select lt.tag_id from public.listing_tags lt where lt.listing_id = l.id) as tags,
           array(select a from app.region_ancestors(l.region_id) a) as up,
           (select r.parent_id from public.regions r where r.id = l.region_id) as parent,
           array(select pt.tag_id from public.listing_tags pt where pt.listing_id = l.pair_id) as pair_tags,
           tsvector_to_array(l.search) as words, l.embedding
    from public.listings l where l.id = p_listing
  ), cand as (
    select o.id, o.created_at,
      case when me.embedding is not null and o.embedding is not null
           then 1 - (o.embedding operator(extensions.<=>) me.embedding) end as sim,
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
  ), rel as (
    -- gte-small rates most German texts as fairly similar, so meaning counts relative to this listing's average
    select c.*, c.sim - avg(c.sim) over () as lift from cand c
  ), scored as (
    select c.id, c.created_at,
      (least(cardinality(c.shared), 3) * 3 + least(c.common, 3) * 2 + case when c.same_cat then 2 else 0 end
       + case when c.same_place then 3 when c.near then 1 else 0 end
       + case when c.deal then 2 else 0 end + case when c.employment then 1 else 0 end
       + case when c.route then 4 else 0 end + case when c.budget then 1 else 0 end + case when c.swap then 5 else 0 end
       + case when c.lift >= 0.06 then 3 else 0 end)::int as score,
      array_remove(
        array(select 'tag:' || s from unnest(c.shared) s limit 2)
        || array[case when c.route then 'route' end, case when c.swap then 'swap' end,
                 case when c.common > 0 then 'words' end, case when c.lift >= 0.06 then 'meaning' end, case when c.same_cat then 'category' end,
                 case when c.deal then 'deal' end, case when c.employment then 'employment' end,
                 case when c.budget then 'budget' end,
                 case when c.same_place then 'place' when c.near then 'near' when c.online then 'online' end], null) as reasons,
      cardinality(c.shared) > 0 or c.common > 0 or c.route or coalesce(c.lift >= 0.06, false) as relevant
    from rel c
  )
  select s.id, s.score, s.reasons from scored s
  where s.relevant and s.score >= 3
  order by s.score desc, s.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
$$;
