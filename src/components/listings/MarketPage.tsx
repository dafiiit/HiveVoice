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

type Card = ListingCard & { why: string | null; sent: boolean; allied: boolean };

export async function MarketPage({ kind, searchParams }: { kind: "offer" | "need"; searchParams: Record<string, string | string[] | undefined> }) {
  const give = kind === "offer";
  const other = give ? "need" : "offer";
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const tabs = ["you", "near", "inbox"] as const;
  const active = (tabs as readonly string[]).includes(String(searchParams.tab)) ? (searchParams.tab as (typeof tabs)[number]) : session ? "you" : "near";
  const paid = searchParams.paid === "1";
  const base = give ? "/offers" : "/needs";

  const data = await asViewer(viewer, async (tx) => {
    const regions = await myRegionIds(tx, me ?? undefined);
    const relation = give ? "offers" : "needs";
    const myTags = me ? (await tx<{ tag_id: string }[]>`
      select lt.tag_id from public.listing_tags lt join public.listings l on l.id = lt.listing_id where l.owner_id = ${me} and l.kind = ${kind} and l.status = 'active'
      union select tag_id from public.user_interests where profile_id = ${me} and relation = ${relation}`).map((r) => r.tag_id) : [];
    const sentTo = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.contact_requests where from_profile_id = ${me} and status in ('pending', 'accepted')`).map((r) => r.listing_id) : [];
    const allied = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.listing_allies where profile_id = ${me}`).map((r) => r.listing_id) : [];
    const mine = me ? await tx<(ListingCard & { matches: number; similar: number })[]>`
      select ${listingCardColumns(tx)},
        (select count(distinct o.id)::int from public.listings o join public.listing_tags ot on ot.listing_id = o.id
          join public.listing_tags lt on lt.tag_id = ot.tag_id and lt.listing_id = l.id where o.kind = ${other} and o.status = 'active' and o.owner_id <> ${me}) as matches,
        (select count(distinct o.id)::int from public.listings o join public.listing_tags ot on ot.listing_id = o.id
          join public.listing_tags lt on lt.tag_id = ot.tag_id and lt.listing_id = l.id where o.kind = 'need' and o.status = 'active' and o.owner_id <> ${me}
            and o.region_id = any(${regions}::uuid[])) as similar
      from ${listingCardFrom(tx)} where l.owner_id = ${me} and l.kind = ${kind} and l.status in ('active', 'paused') order by l.created_at desc` : [];
    let cards: Card[] = [];
    if (active === "you" && me) {
      cards = await tx<Card[]>`
        select ${listingCardColumns(tx)},
          (select t.slug::text from public.listing_tags lt join public.tags t on t.id = lt.tag_id where lt.listing_id = l.id and lt.tag_id = any(${myTags}::uuid[]) limit 1) as why
        from ${listingCardFrom(tx)}
        where l.kind = ${other} and l.status = 'active' and l.owner_id <> ${me}
          and exists (select 1 from public.listing_tags lt where lt.listing_id = l.id and lt.tag_id = any(${myTags}::uuid[]))
          ${!give && !paid ? tx`and l.pay_mode <> 'hourly'` : tx``}
        order by (l.region_id = any(${regions}::uuid[])) desc, l.created_at desc limit 40`;
    } else if (active === "near") {
      cards = await tx<Card[]>`
        select ${listingCardColumns(tx)}, null as why from ${listingCardFrom(tx)}
        where l.kind = ${other} and l.status = 'active' ${me ? tx`and l.owner_id <> ${me}` : tx``}
          ${!give && !paid ? tx`and l.pay_mode <> 'hourly'` : tx``}
        order by (l.region_id = any(${regions}::uuid[])) desc, l.created_at desc limit 60`;
    }
    cards = cards.map((c) => ({ ...c, sent: sentTo.includes(c.id), allied: allied.includes(c.id) }));
    const inbox = active === "inbox" && me ? {
      incoming: await tx<ContactRow[]>`
        select c.id, c.status::text, c.message, c.created_at, l.title as listing_title, p.id as other_id, p.display_name as other_name, p.avatar_seed as other_seed, p.avatar_path as other_path,
               (select v.id from public.conversations v where v.contact_request_id = c.id) as conversation_id
        from public.contact_requests c join public.profiles p on p.id = c.from_profile_id left join public.listings l on l.id = c.listing_id
        where c.to_profile_id = ${me} and c.status <> 'withdrawn' order by (c.status = 'pending') desc, c.created_at desc limit 50`,
      outgoing: await tx<ContactRow[]>`
        select c.id, c.status::text, c.message, c.created_at, l.title as listing_title, p.id as other_id, p.display_name as other_name, p.avatar_seed as other_seed, p.avatar_path as other_path,
               (select v.id from public.conversations v where v.contact_request_id = c.id) as conversation_id
        from public.contact_requests c join public.profiles p on p.id = c.to_profile_id left join public.listings l on l.id = c.listing_id
        where c.from_profile_id = ${me} and c.status <> 'withdrawn' order by c.created_at desc limit 50`,
    } : null;
    const pendingIn = me ? Number((await tx`select count(*)::int n from public.contact_requests where to_profile_id = ${me} and status = 'pending'`)[0].n) : 0;
    const popular = await popularTags(tx);
    const [region] = me ? await tx<{ id: string; name: string }[]>`select r.id, r.name from public.profiles p join public.regions r on r.id = p.home_region_id where p.id = ${me}` : [];
    return { mine, cards, inbox, pendingIn, popular, region };
  });

  const ideas = (t.raw(give ? "ideasOffer" : "ideasNeed") as string[]) ?? [];
  const mine: MyListing[] = data.mine.map((m) => ({ id: m.id, title: m.title, price: priceLabel(m, tc, locale), status: m.status, matches: m.matches, similar: m.similar, ally_count: m.ally_count }));
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab: active, ...(paid ? { paid: "1" } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `${base}?${p}`;
  };

  return (
    <div className="flex flex-col gap-8 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-12">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0">{t(give ? "offerTitle" : "needTitle")}</h1>
        <p className="m-0 max-w-[640px]">{t(give ? "offerLead" : "needLead")}</p>
      </div>
      {session ? <ListingEditor kind={kind} ideas={ideas} regionId={data.region?.id ?? null} regionName={data.region?.name ?? null} popular={data.popular} />
        : <p className="m-0"><Link href={`/login?next=${base}`} className="font-bold">{tc("signInToWrite")}</Link></p>}
      <MyListings kind={kind} items={mine} />
      <div role="tablist" aria-label={t("view")} className="flex overflow-x-auto border-b border-line">
        {tabs.filter((k) => session || k === "near").map((k) => (
          <Link key={k} role="tab" aria-selected={active === k} href={href({ tab: k })} scroll={false} className={tab(active === k)}>
            {k === "inbox" ? (data.pendingIn ? t("tabs.inboxN", { n: data.pendingIn }) : t("tabs.inbox")) : t(`tabs.${give ? "offer" : "need"}.${k}`)}
          </Link>
        ))}
      </div>
      {!give && active !== "inbox" && (
        <Link href={href({ paid: paid ? "" : "1" })} className="inline-flex items-center gap-2 self-start text-sm text-ink no-underline" aria-pressed={paid}>
          <span className={`inline-block h-5 w-5 border border-ink ${paid ? "bg-ink" : ""}`} aria-hidden="true" /> {t("showPaid")}
        </Link>
      )}
      {active === "inbox" && data.inbox && <Inbox incoming={data.inbox.incoming} outgoing={data.inbox.outgoing} />}
      {active !== "inbox" && (
        data.cards.length === 0
          ? <p className="m-0 text-muted">{active === "you" ? t(give ? "emptyYouOffer" : "emptyYouNeed") : t("emptyNear")}</p>
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.cards.map((c) => <ListingCardView key={c.id} c={c} signedIn={!!session} why={c.why} sent={c.sent} allied={c.allied} />)}
            </div>
      )}
    </div>
  );
}
