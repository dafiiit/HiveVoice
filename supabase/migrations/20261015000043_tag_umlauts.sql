-- Hashtags keep their umlauts (#übernachtung, not #uebernachtung or #ubernachtung). Group addresses
-- still use app.slugify (plain letters for URLs); only tags get their own, gentler slug.

create or replace function app.tag_slug(p text) returns text
language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(
    translate(lower(p), 'éèáàóòíìúùç', 'eeaaooiiuuc'), '[^a-z0-9äöüß]+', '-', 'g')), 40)
$$;
grant execute on function app.tag_slug(text) to anon, authenticated, hivevoice_server;

create or replace function app.ensure_tags(p_slugs text[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare s text; ids uuid[] := '{}'; v uuid;
begin
  foreach s in array coalesce(p_slugs, '{}') loop
    s := app.tag_slug(s);
    continue when s = '' or char_length(s) > 40;
    insert into public.tags (slug, label) values (s, s) on conflict (slug) do nothing;
    select id into v from public.tags where slug = s;
    ids := ids || v;
  end loop;
  return ids;
end $$;

-- Existing tags that were written without umlauts. Where the spelling with umlauts exists already,
-- the old one stays (merging would touch every link table); new uses go to the new spelling.
do $$
declare m record;
begin
  for m in select * from (values
    ('uebernachtung', 'übernachtung'), ('mobilitaet', 'mobilität'), ('muellsammeln', 'müllsammeln'), ('vorfuehrort', 'vorführort'),
    ('behoerdengang', 'behördengang'), ('blumen-giessen', 'blumen-gießen'), ('foerderung', 'förderung'), ('fussball', 'fußball'),
    ('gruenden', 'gründen'), ('moebel-aufbauen', 'möbel-aufbauen'), ('naehen', 'nähen'), ('sanitaer', 'sanitär'), ('strassenfest', 'straßenfest'),
    ('ubernachtung', 'übernachtung'), ('mobilitat', 'mobilität'), ('mullsammeln', 'müllsammeln'), ('forderung', 'förderung'), ('grunden', 'gründen')
  ) as x(old, new) loop
    update public.tags set slug = m.new, label = m.new
    where slug = m.old and not exists (select 1 from public.tags t where t.slug = m.new);
  end loop;
end $$;
