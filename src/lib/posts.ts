import "server-only";
import type { Tx } from "./db";
import { regionTree } from "./queries";
import { loadExtras } from "./extras";
import { cardOf, loadRefCards, type RefCard } from "./refs";
import type { Attachment, PollView } from "./files";

export type PostView = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_seed: number;
  author_path: string | null;
  author_mode: "real" | "alias";
  author_region: string | null;
  score: number;
  reply_count: number;
  is_pinned: boolean;
  my_vote: number;
  listing_id: string | null;
  listing_title: string | null;
  listing_kind: string | null;
  initiative_id: string | null;
  initiative_title: string | null;
  replies: PostView[];
  attachments: Attachment[];
  poll: PollView | null;
  /** Something passed on as a card. */
  ref: RefCard | "missing" | null;
  ref_type?: string | null;
  ref_id?: string | null;
  /** Taken down by the group's moderators: the post stays as a visible gap. */
  removed: boolean;
  hidden_reason: string | null;
  locked: boolean;
};

type Scope = { groupId?: string; initiativeId?: string; regionIds?: string[]; underRegionId?: string; search?: string };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Top-level posts of a group, an initiative thread or a regional marketplace, with replies. */
export async function loadPosts(tx: Tx, scope: Scope, viewerId: string | null, opts: { sort?: "new" | "top" | "chat"; limit?: number } = {}) {
  const words = (scope.search ?? "").split(/\s+/).filter(Boolean).slice(0, 5).map((w) => `%${escapeLike(w)}%`);
  const where = scope.groupId
    ? tx`p.group_id = ${scope.groupId}`
    : scope.initiativeId
      ? tx`p.initiative_id = ${scope.initiativeId}`
      : scope.underRegionId
        ? tx`p.region_id in ${regionTree(tx, scope.underRegionId)} and p.group_id is null and p.initiative_id is null`
        : tx`p.region_id = any(${scope.regionIds ?? []}::uuid[]) and p.group_id is null and p.initiative_id is null`;
  const filter = words.length ? tx`and p.body ilike all (${words}::text[])` : tx``;
  // "chat": the newest messages, oldest of them first, so the latest one sits at the bottom.
  const order = opts.sort === "top"
    ? tx`p.is_pinned desc, (p.score + p.reply_count * 2)::float / power(extract(epoch from now() - p.created_at) / 3600 + 2, 1.2) desc`
    : opts.sort === "chat" ? tx`p.created_at desc` : tx`p.is_pinned desc, p.created_at desc`;
  const posts = await tx<PostView[]>`
    select ${postColumns(tx, viewerId)}
    from public.posts p join public.profiles a on a.id = p.author_id
    left join public.regions ar on ar.id = a.home_region_id
    left join public.listings l on l.id = p.listing_id
    left join public.initiatives i on i.id = p.initiative_id
    where ${where} ${filter} and p.parent_id is null and (p.hidden_at is null or p.hidden_by is not null)
    order by ${order} limit ${opts.limit ?? 40}`;
  if (opts.sort === "chat") posts.reverse();
  if (!posts.length) return posts;
  const replies = await tx<(PostView & { parent_id: string })[]>`
    select ${postColumns(tx, viewerId)}, p.parent_id
    from public.posts p join public.profiles a on a.id = p.author_id
    left join public.regions ar on ar.id = a.home_region_id
    left join public.listings l on l.id = p.listing_id
    left join public.initiatives i on i.id = p.initiative_id
    where p.parent_id = any(${posts.map((p) => p.id)}::uuid[]) and (p.hidden_at is null or p.hidden_by is not null)
    order by p.created_at asc`;
  for (const p of posts) p.replies = replies.filter((r) => r.parent_id === p.id);
  const ex = await loadExtras(tx, "post", [...posts, ...replies].map((p) => p.id));
  const cards = await loadRefCards(tx, [...posts, ...replies].map((p) => ({ type: p.ref_type ?? null, id: p.ref_id ?? null })));
  for (const p of [...posts, ...replies]) {
    p.attachments = ex.attachments.get(p.id) ?? [];
    p.poll = ex.polls.get(p.id) ?? null;
    p.ref = p.removed ? null : cardOf(cards, p);
  }
  return posts;
}

const postColumns = (tx: Tx, viewerId: string | null) => tx`
  p.id, p.body, p.created_at, p.author_id, p.score, p.reply_count, p.is_pinned, p.listing_id, p.initiative_id, p.ref_type, p.ref_id, null::jsonb as ref,
  a.display_name as author_name, a.avatar_seed as author_seed, a.avatar_path as author_path, a.display_mode as author_mode, ar.name as author_region,
  l.title as listing_title, l.kind::text as listing_kind, i.title as initiative_title,
  ${viewerId ? tx`coalesce((select v.value from public.post_votes v where v.post_id = p.id and v.profile_id = ${viewerId}), 0)` : tx`0`}::int as my_vote,
  p.hidden_by is not null as removed, p.hidden_reason, p.locked,
  '[]'::jsonb as replies, '[]'::jsonb as attachments, null::jsonb as poll`;

/** Hashtags used most in the marketplace of a region tree: ideas for the filter. */
export async function marketTags(tx: Tx, underRegionId: string, limit = 8) {
  const rows = await tx<{ tag: string }[]>`
    select lower(m[1]) as tag from public.posts p, regexp_matches(p.body, '#([[:alnum:]_-]{2,30})', 'g') m
    where p.region_id in ${regionTree(tx, underRegionId)} and p.group_id is null and p.initiative_id is null and p.hidden_at is null
    group by 1 order by count(*) desc, 1 limit ${limit}`;
  return rows.map((r) => r.tag);
}
