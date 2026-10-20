"use server";
import { run } from "../action";

export type PersonHit = { id: string; name: string; seed: number; path: string | null; headline: string | null };

/**
 * Who a picker may offer: anyone findable, only verified people, people not yet in a group,
 * or verified people not yet authors of an initiative.
 */
export type PeopleFilter =
  | { kind: "any" }
  | { kind: "verified" }
  | { kind: "notInGroup"; groupId: string }
  | { kind: "notAuthor"; initiativeId: string };

/** The one search for people behind every picker: three letters at least, limited per hour, never yourself. */
export async function searchPeople(q: string, filter: PeopleFilter = { kind: "any" }): Promise<PersonHit[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const like = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const res = await run(async (tx, s) => {
    const [{ ok }] = await tx<{ ok: boolean }[]>`select app.people_search_allowed() as ok`;
    if (!ok) return [] as PersonHit[];
    const extra = filter.kind === "verified" ? tx`and app.profile_is_verified(p.id)`
      : filter.kind === "notInGroup" ? tx`and not exists (select 1 from public.group_members m where m.group_id = ${filter.groupId} and m.profile_id = p.id)`
      : filter.kind === "notAuthor" ? tx`and app.profile_is_verified(p.id) and not exists (select 1 from public.initiative_authors a where a.initiative_id = ${filter.initiativeId} and a.profile_id = p.id)`
      : tx``;
    return tx<PersonHit[]>`
      select p.id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path, p.headline from public.profiles p
      where p.onboarded_at is not null and p.id <> ${s.profile.id} and lower(p.display_name) like ${like}
        and app.can_find(${s.profile.id}::uuid, p.id) ${extra}
      order by p.helped_count desc, p.display_name limit 8`;
  });
  return res.ok ? res.data : [];
}
