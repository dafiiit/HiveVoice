import "server-only";
import type { Tx } from "./db";

export type InitiativeCard = {
  id: string;
  title: string;
  summary: string | null;
  phase: "idea" | "debate" | "addressee" | "implementation" | "done";
  outcome: "rejected_vote" | "rejected_addressee" | "withdrawn" | null;
  support_count: number;
  argument_count: number;
  region_name: string;
  region_level: string;
  addressee: string | null;
  cover_seed: number;
  ballot_closes_at: string | null;
  top_pro: string | null;
  top_contra: string | null;
  created_at: string;
};

export const initiativeCardColumns = (tx: Tx) => tx`
  i.id, i.title, i.summary, i.phase, i.outcome, i.support_count, i.argument_count, i.cover_seed, i.created_at,
  r.name as region_name, r.level as region_level,
  coalesce(resp.organization_name || ' · ' || resp.title, resp.title, i.addressee_text) as addressee,
  (select b.closes_at from public.ballots b where b.initiative_id = i.id and b.status = 'open' limit 1) as ballot_closes_at,
  (select a.body from public.arguments a where a.initiative_id = i.id and a.side = 'pro' and a.hidden_at is null
     order by a.bridge_score desc, a.support_count desc limit 1) as top_pro,
  (select a.body from public.arguments a where a.initiative_id = i.id and a.side = 'contra' and a.hidden_at is null
     order by a.bridge_score desc, a.support_count desc limit 1) as top_contra`;

export const initiativeCardFrom = (tx: Tx) => tx`
  public.initiatives i
  join public.regions r on r.id = i.region_id
  left join public.responsibilities resp on resp.id = i.addressee_responsibility_id`;

export type ListingCard = {
  id: string;
  kind: "offer" | "need";
  title: string;
  description: string | null;
  pay_mode: "free" | "hourly" | "fixed" | "swap";
  hourly_rate_cents: number | null;
  fixed_price_cents: number | null;
  swap_text: string | null;
  location_text: string | null;
  schedule_text: string | null;
  seats: number | null;
  is_recurring: boolean;
  seeking_allies: boolean;
  ally_count: number;
  cover_seed: number | null;
  status: string;
  owner_id: string;
  owner_name: string;
  owner_seed: number;
  group_name: string | null;
  group_slug: string | null;
  goal_title: string | null;
  region_name: string | null;
  tags: string[];
  created_at: string;
};

export const listingCardColumns = (tx: Tx) => tx`
  l.id, l.kind, l.title, l.description, l.pay_mode, l.hourly_rate_cents, l.fixed_price_cents, l.swap_text,
  l.location_text, l.schedule_text, l.seats, l.is_recurring, l.seeking_allies, l.ally_count, l.cover_seed, l.status,
  l.owner_id, l.created_at, p.display_name as owner_name, p.avatar_seed as owner_seed, g.name as group_name, g.slug as group_slug,
  go.title as goal_title, r.name as region_name,
  coalesce((select array_agg(t.slug::text order by t.slug) from public.listing_tags lt join public.tags t on t.id = lt.tag_id
            where lt.listing_id = l.id), '{}') as tags`;

export const listingCardFrom = (tx: Tx) => tx`
  public.listings l
  join public.profiles p on p.id = l.owner_id
  left join public.groups g on g.id = l.group_id
  left join public.goals go on go.id = l.goal_id
  left join public.regions r on r.id = l.region_id`;

/** Ids of the viewer's home region and all regions above it. */
export async function myRegionIds(tx: Tx, profileId: string | undefined) {
  if (!profileId) return [] as string[];
  const rows = await tx<{ region_id: string }[]>`select region_id from public.user_regions where profile_id = ${profileId}`;
  return rows.map((r) => r.region_id);
}

/** The viewer's municipality (or city district's municipality) for the local marketplace. */
export async function myMunicipality(tx: Tx, profileId: string | undefined) {
  if (!profileId) return null;
  const [row] = await tx<{ id: string; name: string }[]>`
    select r.id, r.name from public.user_regions ur join public.regions r on r.id = ur.region_id
    where ur.profile_id = ${profileId} and r.level = 'municipality' limit 1`;
  return row ?? null;
}
