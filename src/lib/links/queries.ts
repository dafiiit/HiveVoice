import "server-only";
import type { Tx } from "../db";
import type { Note, Trust } from "./safety";

export type ResourceRow = {
  id: string; url: string; host: string; provider: string; kind: string; title: string; description: string | null;
  preview: { title?: string | null; description?: string | null; image?: string | null; site?: string | null; mime?: string | null; bytes?: number | null; filename?: string | null };
  safety: Trust; notes: Note[]; score: number; created_at: string;
  group_id: string | null; group_slug: string | null; group_name: string | null;
  owner_id: string; owner_name: string; owner_seed: number; owner_path: string | null;
  tags: string[]; my_vote: number | null;
};

export const resourceColumns = (tx: Tx, me: string | null) => tx`
  r.id, r.url, r.host, r.provider, r.kind, r.title, r.description, r.preview, r.safety, r.safety_notes as notes, r.score, r.created_at,
  r.group_id, g.slug::text as group_slug, g.name as group_name,
  o.id as owner_id, o.display_name as owner_name, o.avatar_seed as owner_seed, o.avatar_path as owner_path,
  coalesce((select array_agg(t.slug::text order by t.slug) from public.resource_tags rt join public.tags t on t.id = rt.tag_id where rt.resource_id = r.id), '{}') as tags,
  ${me ? tx`(select v.value::int from public.resource_votes v where v.resource_id = r.id and v.profile_id = ${me})` : tx`null`} as my_vote`;

export const resourceFrom = (tx: Tx) => tx`
  public.resources r join public.profiles o on o.id = r.owner_id left join public.groups g on g.id = r.group_id`;
