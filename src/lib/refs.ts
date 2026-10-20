import "server-only";
import type { Tx } from "./db";

// Everything that can travel as a card: into a chat, a group's talk, the marketplace, a group's collection.
export const REF_TYPES = ["listing", "resource", "group", "task", "initiative"] as const;
export type RefType = (typeof REF_TYPES)[number];
export type Ref = { type: RefType; id: string };
export const isRefType = (v: unknown): v is RefType => (REF_TYPES as readonly unknown[]).includes(v);

/** What a card shows. `kind` refines the type (offer or request, document kind, task status). */
export type RefCard = { type: RefType; id: string; title: string; kind: string | null; sub: string | null; href: string };

const key = (r: { type: string; id: string }) => `${r.type}:${r.id}`;

/**
 * Cards for a set of references, read with the viewer's rights: whatever the viewer may not see is missing from the
 * map, and the card says so instead of revealing a title.
 */
export async function loadRefCards(tx: Tx, refs: { type: string | null; id: string | null }[]) {
  const by = new Map<RefType, string[]>();
  for (const r of refs) if (r.type && r.id && isRefType(r.type)) by.set(r.type, [...(by.get(r.type) ?? []), r.id]);
  const out = new Map<string, RefCard>();
  const add = (rows: RefCard[]) => rows.forEach((r) => out.set(key(r), r));
  const ids = (t: RefType) => [...new Set(by.get(t) ?? [])];
  if (by.has("listing")) add(await tx<RefCard[]>`
    select 'listing' as type, l.id, l.title, l.kind::text as kind, l.category as sub,
           '/anliegen/' || l.id as href
    from public.listings l where l.id = any(${ids("listing")}::uuid[])`);
  if (by.has("resource")) add(await tx<RefCard[]>`
    select 'resource' as type, r.id, r.title, r.kind::text as kind, r.host as sub, '/links/' || r.id as href
    from public.resources r where r.id = any(${ids("resource")}::uuid[]) and r.trashed_at is null`);
  if (by.has("group")) add(await tx<RefCard[]>`
    select 'group' as type, g.id, g.name as title, g.kind::text as kind, g.member_count::text as sub, '/groups/' || g.slug as href
    from public.groups g where g.id = any(${ids("group")}::uuid[]) and g.archived_at is null`);
  if (by.has("task")) add(await tx<RefCard[]>`
    select 'task' as type, t.id, t.title, t.status::text as kind, g.name as sub, '/groups/' || g.slug || '?tab=tasks#task-' || t.id as href
    from public.tasks t join public.groups g on g.id = t.group_id where t.id = any(${ids("task")}::uuid[])`);
  if (by.has("initiative")) add(await tx<RefCard[]>`
    select 'initiative' as type, i.id, i.title, null as kind, i.summary as sub, '/initiatives/' || i.id as href
    from public.initiatives i where i.id = any(${ids("initiative")}::uuid[])`);
  return out;
}

/** The card of one row with ref_type/ref_id, or "missing" when it is set but not visible to the viewer. */
export function cardOf(cards: Map<string, RefCard>, row: { ref_type?: string | null; ref_id?: string | null }) {
  if (!row.ref_type || !row.ref_id) return null;
  return cards.get(key({ type: row.ref_type, id: row.ref_id })) ?? ("missing" as const);
}
