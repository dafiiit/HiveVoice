"use server";
import { asViewer } from "@/lib/db";
import { run } from "@/lib/action";
import { getViewer } from "@/lib/session";

export type Place = { id: string; name: string; level: string; context: string | null; boroughs: number; locality: string | null };

export async function searchPlaces(q: string): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  return asViewer(null, async (tx) => {
    if (/^\d{3,5}$/.test(query)) {
      return tx<Place[]>`
        select r.id, r.name, r.level::text, d.name as context, min(p.locality) as locality,
               (select count(*)::int from public.regions b where b.parent_id = r.id and b.level = 'borough') as boroughs
        from public.postal_codes p join public.regions r on r.id = p.region_id
        left join public.regions d on d.id = r.parent_id
        where p.code like ${query + "%"}
        group by r.id, r.name, r.level, d.name order by r.name limit 12`;
    }
    return tx<Place[]>`
      select r.id, r.name, r.level::text, d.name as context, null as locality,
             (select count(*)::int from public.regions b where b.parent_id = r.id and b.level = 'borough') as boroughs
      from public.regions r left join public.regions d on d.id = r.parent_id
      where r.level in ('municipality', 'borough') and lower(r.name) like ${query.toLowerCase() + "%"}
      order by (r.level = 'municipality') desc, length(r.name), r.name limit 12`;
  });
}

export async function boroughsOf(municipalityId: string) {
  return asViewer(null, (tx) => tx<{ id: string; name: string }[]>`
    select id, name from public.regions where parent_id = ${municipalityId} and level = 'borough' order by name`);
}

export async function regionChain(regionId: string) {
  return asViewer(null, (tx) => tx<{ id: string; name: string; level: string }[]>`
    select r.id, r.name, r.level::text from app.region_ancestors(${regionId}) a join public.regions r on r.id = a
    order by array_position(array['borough','municipality','district','state','country'], r.level::text)`);
}

export async function finishOnboarding(input: {
  regionId: string;
  displayMode: "real" | "alias";
  realName: string;
  alias: string;
  needs: string[];
  offers: string[];
  ageOk: boolean;
  isMinor: boolean;
}) {
  if (!input.ageOk) return { ok: false as const, error: "age_required" };
  return run(async (tx) => {
    await tx`select app.complete_onboarding(${tx.json({
      region_id: input.regionId,
      display_mode: input.displayMode,
      real_name: input.realName,
      alias: input.alias,
      needs: input.needs.slice(0, 20),
      offers: input.offers.slice(0, 20),
      age_ok: true,
      is_minor: input.isMinor,
    })})`;
    return null;
  });
}

export async function randomAlias() {
  const viewer = await getViewer();
  if (!viewer) return "";
  const [{ a }] = await asViewer(viewer, (tx) => tx<{ a: string }[]>`select app.random_alias() as a`);
  return a;
}
