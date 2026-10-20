-- One kind of note: the Markdown document (versions, sharing, rights). The old short notes (public.notes)
-- become private Markdown notes of their author; the first line is the title. The table stays for now
-- (empty) so the deployed code keeps working until it is replaced; it can be dropped later.
insert into public.resources (owner_id, url, host, provider, kind, origin, title, body_md, preview, safety, region_id, visibility, created_at, updated_at)
select n.profile_id, null, 'hivevoice', 'note', 'note', 'note',
       case when char_length(t.line) >= 3 then left(t.line, 120) else 'Notiz vom ' || to_char(n.created_at, 'DD.MM.YYYY') end,
       left(n.body, 100000), '{}'::jsonb, 'trusted', p.home_region_id, 'me', n.created_at, n.updated_at
from public.notes n
join public.profiles p on p.id = n.profile_id
cross join lateral (select trim(regexp_replace(split_part(n.body, E'\n', 1), '^#+\s*', '')) as line) t
where char_length(n.body) >= 1;

delete from public.notes;
