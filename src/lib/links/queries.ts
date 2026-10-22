import "server-only";
import type { Tx } from "../db";
import type { Note, Trust } from "./safety";

export type ResourceRow = {
  id: string; url: string | null; origin: "link" | "file" | "note" | "diagram"; excerpt: string | null; updated_at: string;
  file_id: string | null; file_name: string | null; file_mime: string | null; file_size: number | null;
  host: string; provider: string; kind: string; title: string; description: string | null;
  preview: { title?: string | null; description?: string | null; image?: string | null; site?: string | null; mime?: string | null; bytes?: number | null; filename?: string | null };
  safety: Trust; notes: Note[]; score: number; created_at: string;
  group_id: string | null; group_slug: string | null; group_name: string | null;
  owner_id: string; owner_name: string; owner_seed: number; owner_path: string | null;
  tags: string[]; my_vote: number | null;
};

export const resourceColumns = (tx: Tx, me: string | null) => tx`
  r.id, r.url, r.origin, case when r.origin = 'note' then left(r.body_md, 1200) end as excerpt, r.updated_at, f.id as file_id, f.name as file_name, f.mime as file_mime, f.size_bytes as file_size,
  r.host, r.provider, r.kind, r.title, r.description, r.preview, r.safety, r.safety_notes as notes, r.score, r.created_at,
  r.group_id, g.slug::text as group_slug, g.name as group_name,
  o.id as owner_id, o.display_name as owner_name, o.avatar_seed as owner_seed, o.avatar_path as owner_path,
  coalesce((select array_agg(t.slug::text order by t.slug) from public.resource_tags rt join public.tags t on t.id = rt.tag_id where rt.resource_id = r.id), '{}') as tags,
  ${me ? tx`(select v.value::int from public.resource_votes v where v.resource_id = r.id and v.profile_id = ${me})` : tx`null`} as my_vote`;

/** The first lines of a Markdown note as plain text, for cards and previews. */
export function plainExcerpt(md: string | null, max = 180): string {
  if (!md) return "";
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*+\d.\s]+/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()} …` : text;
}

export const resourceFrom = (tx: Tx) => tx`
  public.resources r join public.profiles o on o.id = r.owner_id left join public.groups g on g.id = r.group_id
  left join lateral (select a.id, a.name, a.mime, a.size_bytes from public.attachments a where a.resource_id = r.id order by a.created_at limit 1) f on true`;
