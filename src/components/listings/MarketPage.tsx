import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { listingCardColumns, listingCardFrom, myRegionIds, popularTags, type ListingCard } from "@/lib/queries";
import { redirect } from "next/navigation";
import { btn } from "../ui/styles";
import { Notice, Page, PageHeader, Tabs } from "../ui/Page";
import { getPlace } from "@/lib/place";
import { ListingCardView } from "./ListingCardView";
import { ListingEditor } from "./ListingEditor";
import { MarketExplore } from "./MarketExplore";
import { MyListings, type MyListing } from "./MyListings";
import { priceLabel } from "./price";

type Card = ListingCard & { why: string | null; sent: boolean; allied: boolean; reasons?: string[]; via_id?: string | null };
type Own = { id: string; title: string; kind: "offer" | "need" };

type Tab = "you" | "offers" | "needs";

/**
 * "Anliegen", the one home of offers and wanted posts: one editor with "Ich biete / Ich suche", the own listings
 * of both kinds, what fits them, and everyone's offers and wanted posts with the filters of each category.
 * Contact requests live in Verbinden only.
 */
export async function MarketPage({ searchParams, scope }: { searchParams: Record<string, string | string[] | undefined>; scope: "community" | "me" }) {
  // The old inbox tab: contact requests are answered in Freunde.
  if (searchParams.tab === "inbox") redirect("/friends?f=requests");
  const base = scope === "me" ? "/me/listings" : "/community/listings";
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  // Ich → Meine Anliegen: the own listings and what fits them. Gemeinschaft → Anliegen: everyone's offers and wanted posts.
  const active: Tab = scope === "me" ? "you" : searchParams.tab === "needs" ? "needs" : "offers";
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
    }
    cards = cards.map((c) => ({ ...c, sent: sentTo.includes(c.id), allied: allied.includes(c.id) }));
    const popular = await popularTags(tx);
    const [region] = me ? await tx<{ id: string; name: string }[]>`select r.id, r.name from public.profiles p join public.regions r on r.id = p.home_region_id where p.id = ${me}` : [];
    const groups = me ? await tx<{ id: string; slug: string; name: string }[]>`
      select g.id, g.slug::text, g.name from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.profile_id = ${me} and g.archived_at is null and app.has_group_permission(g.id, 'post') order by g.name` : [];
    return { mine, own, cards, popular, region, groups };
  });

  const ideas = { offer: (t.raw("ideasOffer") as string[]) ?? [], need: (t.raw("ideasNeed") as string[]) ?? [] };
  const mine: MyListing[] = data.mine.map((m) => ({ id: m.id, kind: m.kind, title: m.title, price: priceLabel(m, tc, locale), status: m.status, matches: m.matches, similar: m.similar, ally_count: m.ally_count }));
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab: active, ...(paid ? { paid: "1" } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `${base}?${p}`;
  };
  // The reference offered when asking: my own listings of the other kind.
  const ownFor = (c: Card) => data.own.filter((o) => o.kind !== c.kind);

  const place = scope === "me" ? null : await getPlace();
  if (scope === "community") {
    return (
      <Page>
        <PageHeader title={t("communityTitle")} lead={t("communityLead")} mobileHidden
          actions={<Link href={session ? "/me/listings" : "/login?next=/me/listings"} className={btn.primarySm}>{t("create")}</Link>} />
        <Tabs label={t("view")} items={(["offers", "needs"] as const).map((k) => ({ href: href({ tab: k }), label: t(`tabs.${k}`), on: active === k }))} />
        <MarketExplore sp={searchParams} session={session} side={active === "offers" ? "offer" : "need"} homeRegions={place?.chain.map((r) => r.id) ?? []} base={base} />
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader title={t("mineTitle")} mobileHidden />
      {session ? <ListingEditor kind={startKind} groups={data.groups} startWithLink={searchParams.share === "link"} initialTitle={typeof searchParams.title === "string" ? searchParams.title.slice(0, 120) : ""} ideas={ideas} regionId={data.region?.id ?? null} regionName={data.region?.name ?? null} popular={data.popular} />
        : <Link href="/login?next=/me/listings" className={`${btn.primary} self-start`}>{tc("signInToWrite")}</Link>}
      <MyListings items={mine} />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-2">
        <h2 className="m-0 text-lg font-bold">{t("fitsYou")}</h2>
        <Link href={href({ paid: paid ? "" : "1" })} className="inline-flex items-center gap-2 text-sm text-ink no-underline" aria-pressed={paid}>
          <span className={`inline-block h-5 w-5 border border-ink ${paid ? "bg-ink" : ""}`} aria-hidden="true" /> {t("showPaid")}
        </Link>
      </div>
      {data.cards.length === 0
        ? <Notice tone="hint">{t("emptyYou")}</Notice>
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.cards.map((c) => <ListingCardView key={c.id} c={c} signedIn={!!session} why={c.why} sent={c.sent} allied={c.allied} reasons={c.reasons} mine={ownFor(c)} via={c.via_id} />)}
          </div>}
    </Page>
  );
}
