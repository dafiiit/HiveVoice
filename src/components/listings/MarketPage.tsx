import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { listingCardColumns, listingCardFrom, myRegionIds, popularTags, type ListingCard } from "@/lib/queries";
import { tab } from "../ui/styles";
import { ListingCardView } from "./ListingCardView";
import { ListingEditor } from "./ListingEditor";
import { MyListings, type MyListing } from "./MyListings";
import { Inbox, type ContactRow } from "./Inbox";
import { priceLabel } from "./price";
import { Lead } from "../ui/Lead";

type Card = ListingCard & { why: string | null; sent: boolean; allied: boolean; reasons?: string[]; via_id?: string | null };
type Own = { id: string; title: string; kind: "offer" | "need" };

const TABS = ["you", "offers", "needs", "inbox"] as const;

/**
 * "Anliegen": offering and looking in one place. One editor with "Ich biete / Ich suche", the own listings of both
 * kinds, and what fits them, then everyone's offers and requests, and the inbox of contact requests.
 */
export async function MarketPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const active = (TABS as readonly string[]).includes(String(searchParams.tab)) ? (searchParams.tab as (typeof TABS)[number]) : session ? "you" : "offers";
  const paid = searchParams.paid === "1";
  const startKind = searchParams.as === "need" ? "need" : "offer";

  const data = await asViewer(viewer, async (tx) => {
    const regions = await myRegionIds(tx, me ?? undefined);
    const sentTo = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.contact_requests where from_profile_id = ${me} and status in ('pending', 'accepted')`).map((r) => r.listing_id) : [];
    const allied = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.listing_allies where profile_id = ${me}`).map((r) => r.listing_id) : [];
    const mine = me ? await tx<(ListingCard & { matches: number; similar: number })[]>`
      select ${listingCardColumns(tx)},
        (select count(*)::int from app.listing_matches(l.id, 50)) as matches,
        (select count(distinct o.id)::int from public.listings o join public.listing_tags ot on ot.listing_id = o.id
          join public.listing_tags lt on lt.tag_id = ot.tag_id and lt.listing_id = l.id where l.kind = 'need' and o.kind = 'need' and o.status = 'active' and o.owner_id <> ${me}
            and o.region_id = any(${regions}::uuid[])) as similar
      from ${listingCardFrom(tx)} where l.owner_id = ${me} and l.status in ('active', 'paused') order by l.created_at desc` : [];
    const own = mine.filter((m) => m.status === "active").map((m) => ({ id: m.id, title: m.title, kind: m.kind })) as Own[];
    const paidFilter = !paid ? tx`and not (l.kind = 'offer' and l.pay_mode = 'hourly')` : tx``;
    let cards: Card[] = [];
    if (active === "you" && me) {
      // First what fits my own listings (with the reasons and the listing it fits), then what fits my profile interests.
      const matched = await tx<Card[]>`
        select ${listingCardColumns(tx)}, null as why, x.reasons, x.via_id from (
          select distinct on (m.id) m.id, m.score, m.reasons, my.id as via_id
          from public.listings my cross join lateral app.listing_matches(my.id, 20) m
          where my.owner_id = ${me} and my.status = 'active'
          order by m.id, m.score desc) x
        join ${listingCardFrom(tx)} on l.id = x.id
        where true ${paidFilter}
        order by x.score desc, l.created_at desc limit 40`;
      const byInterest = await tx<Card[]>`
        select ${listingCardColumns(tx)},
          (select t.slug::text from public.listing_tags lt join public.tags t on t.id = lt.tag_id join public.user_interests ui on ui.tag_id = lt.tag_id
            where lt.listing_id = l.id and ui.profile_id = ${me} limit 1) as why
        from ${listingCardFrom(tx)}
        where l.status = 'active' and l.owner_id <> ${me} ${paidFilter}
          and exists (select 1 from public.listing_tags lt join public.user_interests ui on ui.tag_id = lt.tag_id and ui.profile_id = ${me}
                      and ui.relation::text = case l.kind when 'need' then 'offers' else 'needs' end where lt.listing_id = l.id)
          and not (l.id = any(${matched.map((m) => m.id)}::uuid[]))
        order by (l.region_id = any(${regions}::uuid[])) desc, l.created_at desc limit 40`;
      cards = [...matched, ...byInterest];
    } else if (active === "offers" || active === "needs") {
      cards = await tx<Card[]>`
        select ${listingCardColumns(tx)}, null as why from ${listingCardFrom(tx)}
        where l.kind = ${active === "offers" ? "offer" : "need"} and l.status = 'active' ${me ? tx`and l.owner_id <> ${me}` : tx``} ${paidFilter}
        order by (l.region_id = any(${regions}::uuid[])) desc, l.created_at desc limit 60`;
    }
    cards = cards.map((c) => ({ ...c, sent: sentTo.includes(c.id), allied: allied.includes(c.id) }));
    const inbox = active === "inbox" && me ? {
      incoming: await tx<ContactRow[]>`
        select c.id, c.status::text, c.message, c.created_at, l.title as listing_title, v.title as via_title, p.id as other_id, p.display_name as other_name, p.avatar_seed as other_seed, p.avatar_path as other_path,
               (select cv.id from public.conversations cv where cv.contact_request_id = c.id) as conversation_id
        from public.contact_requests c join public.profiles p on p.id = c.from_profile_id left join public.listings l on l.id = c.listing_id
        left join public.listings v on v.id = c.via_listing_id
        where c.to_profile_id = ${me} and c.status <> 'withdrawn' order by (c.status = 'pending') desc, c.created_at desc limit 50`,
      outgoing: await tx<ContactRow[]>`
        select c.id, c.status::text, c.message, c.created_at, l.title as listing_title, v.title as via_title, p.id as other_id, p.display_name as other_name, p.avatar_seed as other_seed, p.avatar_path as other_path,
               (select cv.id from public.conversations cv where cv.contact_request_id = c.id) as conversation_id
        from public.contact_requests c join public.profiles p on p.id = c.to_profile_id left join public.listings l on l.id = c.listing_id
        left join public.listings v on v.id = c.via_listing_id
        where c.from_profile_id = ${me} and c.status <> 'withdrawn' order by c.created_at desc limit 50`,
    } : null;
    const pendingIn = me ? Number((await tx`select count(*)::int n from public.contact_requests where to_profile_id = ${me} and status = 'pending'`)[0].n) : 0;
    const popular = await popularTags(tx);
    const [region] = me ? await tx<{ id: string; name: string }[]>`select r.id, r.name from public.profiles p join public.regions r on r.id = p.home_region_id where p.id = ${me}` : [];
    const groups = me ? await tx<{ id: string; slug: string; name: string }[]>`
      select g.id, g.slug::text, g.name from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.profile_id = ${me} and g.archived_at is null and app.has_group_permission(g.id, 'post') order by g.name` : [];
    return { mine, own, cards, inbox, pendingIn, popular, region, groups };
  });

  const ideas = { offer: (t.raw("ideasOffer") as string[]) ?? [], need: (t.raw("ideasNeed") as string[]) ?? [] };
  const mine: MyListing[] = data.mine.map((m) => ({ id: m.id, kind: m.kind, title: m.title, price: priceLabel(m, tc, locale), status: m.status, matches: m.matches, similar: m.similar, ally_count: m.ally_count }));
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab: active, ...(paid ? { paid: "1" } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/anliegen?${p}`;
  };
  // The reference offered when asking: my own listings of the other kind.
  const ownFor = (c: Card) => data.own.filter((o) => o.kind !== c.kind);

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 md:gap-8 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0 max-md:sr-only">{t("title")}</h1>
        <Lead long={t("lead")} short={t("leadShort")} />
      </div>
      {session ? <ListingEditor kind={startKind} groups={data.groups} startWithLink={searchParams.share === "link"} initialTitle={typeof searchParams.title === "string" ? searchParams.title.slice(0, 120) : ""} ideas={ideas} regionId={data.region?.id ?? null} regionName={data.region?.name ?? null} popular={data.popular} />
        : <p className="m-0"><Link href="/login?next=/anliegen" className="font-bold">{tc("signInToWrite")}</Link></p>}
      <MyListings items={mine} />
      <div role="tablist" aria-label={t("view")} className="flex overflow-x-auto border-b border-line">
        {TABS.filter((k) => session || (k !== "you" && k !== "inbox")).map((k) => (
          <Link key={k} role="tab" aria-selected={active === k} href={href({ tab: k })} scroll={false} className={tab(active === k)}>
            {k === "inbox" ? (data.pendingIn ? t("tabs.inboxN", { n: data.pendingIn }) : t("tabs.inbox")) : t(`tabs.${k}`)}
          </Link>
        ))}
      </div>
      {(active === "offers" || active === "needs") && <Link href={`/explore?kind=market&side=${active === "offers" ? "offer" : "need"}`} className="self-start text-sm font-bold text-ink">{t("browse")} →</Link>}
      {active !== "inbox" && active !== "needs" && (
        <Link href={href({ paid: paid ? "" : "1" })} className="inline-flex items-center gap-2 self-start text-sm text-ink no-underline" aria-pressed={paid}>
          <span className={`inline-block h-5 w-5 border border-ink ${paid ? "bg-ink" : ""}`} aria-hidden="true" /> {t("showPaid")}
        </Link>
      )}
      {active === "inbox" && data.inbox && <Inbox incoming={data.inbox.incoming} outgoing={data.inbox.outgoing} />}
      {active !== "inbox" && (
        data.cards.length === 0
          ? <p className="m-0 text-muted">{active === "you" ? t("emptyYou") : t("emptyNear")}</p>
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.cards.map((c) => <ListingCardView key={c.id} c={c} signedIn={!!session} why={c.why} sent={c.sent} allied={c.allied} reasons={c.reasons} mine={ownFor(c)} via={c.via_id} />)}
            </div>
      )}
    </div>
  );
}
