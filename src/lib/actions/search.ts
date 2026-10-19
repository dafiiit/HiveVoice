"use server";
import { asViewer } from "../db";
import { getViewer } from "../session";
import { searchPlaces } from "@/app/onboarding/actions";

export async function findSimilar(title: string) {
  const words = title.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 4).slice(0, 5);
  if (!words.length) return [];
  return asViewer(null, (tx) => tx<{ id: string; title: string; region: string; supports: number }[]>`
    select i.id, i.title, r.name as region, i.support_count as supports from public.initiatives i join public.regions r on r.id = i.region_id
    where i.published_at is not null and i.outcome is null
      and exists (select 1 from unnest(${words}::text[]) w where lower(i.title) like '%' || w || '%')
    order by i.support_count desc limit 3`);
}

export type Hit = { kind: "initiative" | "group" | "person" | "responsible" | "link" | "place"; id: string; title: string; sub: string | null; href: string };

const like = (s: string) => `%${s.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** A few matches of every kind for the search box at the top: enough to jump straight to a page. */
export async function quickSearch(q: string): Promise<Hit[]> {
  const query = q.trim().slice(0, 60);
  if (query.length < 2) return [];
  const pattern = like(query);
  const prefix = pattern.slice(1);
  const viewer = await getViewer();
  const hits = await asViewer(viewer, async (tx) => {
    const ini = await tx<{ id: string; title: string; region: string }[]>`
      select i.id, i.title, r.name as region from public.initiatives i join public.regions r on r.id = i.region_id
      where i.published_at is not null and (lower(i.title) like ${pattern} or lower(coalesce(i.summary, '')) like ${pattern})
      order by (lower(i.title) like ${prefix}) desc, i.support_count desc limit 3`;
    const groups = await tx<{ slug: string; name: string; region: string | null }[]>`
      select g.slug::text, g.name, r.name as region from public.groups g left join public.regions r on r.id = g.region_id
      where g.archived_at is null and (lower(g.name) like ${pattern} or lower(coalesce(g.summary, '')) like ${pattern})
      order by (lower(g.name) like ${prefix}) desc, g.member_count desc limit 3`;
    // Names are searched from three letters on, a few times per hour, and only people who may be found are shown.
    const people = query.length >= 3 && (await tx<{ ok: boolean }[]>`select app.people_search_allowed() as ok`)[0].ok
      ? await tx<{ id: string; name: string; headline: string | null; region: string | null }[]>`
      select p.id, p.display_name as name, p.headline, r.name as region from public.profiles p left join public.regions r on r.id = p.home_region_id
      where p.onboarded_at is not null and app.can_find(${viewer?.profileId ?? null}::uuid, p.id)
        and (lower(p.display_name) like ${pattern} or lower(coalesce(p.headline, '')) like ${pattern})
      order by (lower(p.display_name) like ${prefix}) desc, p.helped_count desc limit 3`
      : [];
    const resp = await tx<{ id: string; title: string; org: string | null }[]>`
      select s.id, s.title, s.organization_name as org from public.responsibilities s
      where lower(s.title || ' ' || coalesce(s.organization_name, '') || ' ' || s.description) like ${pattern}
      order by s.is_official desc limit 2`;
    const links = await tx<{ id: string; title: string; host: string }[]>`
      select r.id, r.title, r.host from public.resources r
      where r.hidden_at is null and (lower(r.title) like ${pattern} or lower(coalesce(r.description, '')) like ${pattern} or r.host like ${pattern}
        or exists (select 1 from public.resource_tags rt join public.tags t on t.id = rt.tag_id where rt.resource_id = r.id and t.slug like ${prefix.replace(/^#/, "")}))
      order by r.score desc, r.created_at desc limit 3`;
    return [
      ...ini.map((r): Hit => ({ kind: "initiative", id: r.id, title: r.title, sub: r.region, href: `/initiatives/${r.id}` })),
      ...groups.map((r): Hit => ({ kind: "group", id: r.slug, title: r.name, sub: r.region, href: `/groups/${r.slug}` })),
      ...people.map((r): Hit => ({ kind: "person", id: r.id, title: r.name, sub: [r.headline, r.region].filter(Boolean).join(" · ") || null, href: `/profile/${r.id}` })),
      ...links.map((r): Hit => ({ kind: "link", id: r.id, title: r.title, sub: r.host.replace(/^www\./, ""), href: `/links/${r.id}` })),
      ...resp.map((r): Hit => ({ kind: "responsible", id: r.id, title: r.org ? `${r.org} · ${r.title}` : r.title, sub: null, href: `/responsible?id=${r.id}` })),
    ];
  });
  const places = await searchPlaces(query);
  return [
    ...hits,
    ...places.slice(0, 3).map((p): Hit => ({ kind: "place", id: p.id, title: p.locality && p.locality !== p.name ? `${p.name} · ${p.locality}` : p.name, sub: p.context, href: `/explore?place=${p.id}` })),
  ];
}
