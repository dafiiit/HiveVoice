import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { listingCardColumns, listingCardFrom, type ListingCard } from "@/lib/queries";
import { dateLong } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { Cover } from "../ui/Cover";
import { tag } from "../ui/styles";
import { ReportButton } from "../ReportDialog";
import { ContactButton } from "./ContactButton";
import { AllyButton } from "./MyListings";
import { priceLabel } from "./price";
import { ShareBlock } from "../ShareBlock";
import { ShareMenu } from "../refs/ShareMenu";
import { EditListing } from "./EditListing";
import { AccessPanel } from "../refs/AccessPanel";
import type { AccessGrant, Scope } from "@/lib/actions/share";
import { headers } from "next/headers";
import { attrFacts, customFields } from "@/lib/market";
import { ListingCardView, reasonLabels } from "./ListingCardView";

type Match = ListingCard & { score: number; reasons: string[]; sent: boolean };

export async function ListingDetail({ id, kind, linkToken = null }: { id: string; kind: "offer" | "need"; linkToken?: string | null }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const tl = await getTranslations("listings");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [l] = await tx<ListingCard[]>`select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where l.id = ${id} and l.kind = ${kind}`;
    if (!l) return null;
    const [{ details }] = await tx<{ details: string | null }[]>`select app.listing_private_details(${id}) as details`;
    const sent = me ? (await tx`select 1 from public.contact_requests where listing_id = ${id} and from_profile_id = ${me} and status in ('pending', 'accepted')`).length > 0 : false;
    const allied = me ? (await tx`select 1 from public.listing_allies where listing_id = ${id} and profile_id = ${me}`).length > 0 : false;
    // Matches with their reasons. The owner sees all of them; anyone else sees which of their own listings fit.
    const matches = await tx<Match[]>`
      select ${listingCardColumns(tx)}, m.score, m.reasons,
        ${me ? tx`exists (select 1 from public.contact_requests c where c.listing_id = l.id and c.from_profile_id = ${me} and c.status in ('pending', 'accepted'))` : tx`false`} as sent
      from app.listing_matches(${id}, 24) m join ${listingCardFrom(tx)} on l.id = m.id order by m.score desc`;
    const mine = me && l.owner_id !== me ? await tx<{ id: string; title: string }[]>`
      select id, title from public.listings where owner_id = ${me} and kind <> ${kind} and status = 'active' order by created_at desc limit 20` : [];
    // rights: only for the owner, who manages them
    const access = l.owner_id === me ? (await tx<{ read_scope: Scope; write_scope: Scope; link_token: string | null }[]>`
      select read_scope, write_scope, app.listing_link_token(${id}) as link_token from public.listings where id = ${id}`)[0] : null;
    const grants = access ? await tx<AccessGrant[]>`
      select g.profile_id, p.display_name as name, p.avatar_seed as seed, g.can_write from public.object_grants g join public.profiles p on p.id = g.profile_id
      where g.object_type = 'listing' and g.object_id = ${id} order by p.display_name` : [];
    const canEdit = !!me && l.owner_id !== me && (await tx<{ ok: boolean }[]>`select app.object_access('listing', ${id}, true) as ok`)[0].ok;
    return { l, details, sent, allied, matches, mine, access, grants, canEdit };
  }, { linkToken });
  if (!data) notFound();
  const { l } = data;
  const own = l.owner_id === me;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const tcat = await getTranslations("categories");
  const facts = attrFacts(l.category, l.attrs, (k, v) => tcat(k as "label", v), locale);
  const custom = customFields(l.attrs);
  // For someone else: the best of their own listings that this one fits, preselected as the reference.
  const fit = own ? null : data.matches.find((m) => m.owner_id === me) ?? null;
  const fitReasons = fit ? await reasonLabels(fit.reasons) : [];
  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-4 pb-6 pt-4 md:gap-6 md:px-10 md:pb-20 md:pt-10">
      <nav aria-label={t("breadcrumb")} className="flex gap-2 text-sm">
        <Link href={kind === "offer" ? "/anliegen?tab=offers" : "/anliegen?tab=needs"} className="text-ink">{t(kind === "offer" ? "allOffers" : "allNeeds")}</Link>
      </nav>
      {l.images.length > 0
        ? (
          <div className="flex flex-col gap-2">
            <Cover src={l.images[0]} ratio="16 / 9" label={l.title} />
            {l.images.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {l.images.slice(1).map((p) => <Cover key={p} src={p} ratio="4 / 3" />)}
              </div>
            )}
          </div>
        )
        : l.cover_seed != null && <Cover seed={l.cover_seed} ratio="21 / 9" />}
      <span className="flex items-center gap-2 text-sm">
        <Avatar name={l.group_name ?? l.owner_name} seed={l.group_name ? undefined : l.owner_seed} path={l.group_name ? null : l.owner_path} size={36} group={!!l.group_name} />
        <span>
          {l.group_slug ? <Link href={`/groups/${l.group_slug}`} className="font-bold text-ink">{l.group_name}</Link> : <Link href={`/profile/${l.owner_id}`} className="font-bold text-ink">{l.owner_name}</Link>}{" "}
          {t(kind === "need" ? "needs" : "gives")}
        </span>
      </span>
      <h1 className="display m-0">{l.title}</h1>
      {l.description && <p className="m-0 whitespace-pre-line text-lg">{l.description}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {session && <ShareMenu type="listing" id={l.id} title={l.title} />}
        {(own || data.canEdit) && <EditListing id={l.id} title={l.title} description={l.description} path={`/${kind === "need" ? "needs" : "offers"}/${id}`} />}
        {l.read_scope === "public" && <ShareBlock path={`/${kind === "need" ? "needs" : "offers"}/${id}`} title={l.title} isPublic />}
      </div>
      {data.access && (
        <AccessPanel type="listing" id={l.id} read={data.access.read_scope} write={data.access.write_scope} hasGroup={!!l.group_slug}
          linkUrl={data.access.link_token ? `${origin}/r/listing/${l.id}?k=${data.access.link_token}` : null} grants={data.grants} path={`/${kind === "need" ? "needs" : "offers"}/${id}`} />
      )}
      <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-t border-line pt-4">
        <dt className="font-bold">{t("category")}</dt><dd className="m-0">{tcat(`names.${l.category}` as "names.help")}</dd>
        {facts.map((f) => (<div key={f.key} className="contents"><dt className="font-bold">{f.label}</dt><dd className="m-0">{f.flag ? tcat("yes") : f.value}</dd></div>))}
        {custom.map((f, i) => (<div key={`c${i}`} className="contents"><dt className="font-bold">{f.label}</dt><dd className="m-0 whitespace-pre-line">{f.value}</dd></div>))}
        {l.goal_title && (<><dt className="font-bold">{t("forGoal")}</dt><dd className="m-0">{l.goal_title}</dd></>)}
        <dt className="font-bold">{t("where")}</dt><dd className="m-0">{l.location_text ?? l.region_name ?? "–"}</dd>
        {l.schedule_text && (<><dt className="font-bold">{t("when")}</dt><dd className="m-0">{l.schedule_text}{l.is_recurring ? ` · ${t("recurring")}` : ""}</dd></>)}
        {l.seats && (<><dt className="font-bold">{t(kind === "offer" ? "seatsLabel" : "peopleLabel")}</dt><dd className="m-0">{l.seats}</dd></>)}
        <dt className="font-bold">{t("price")}</dt><dd className="m-0">{priceLabel(l, tc, locale)}</dd>
        <dt className="font-bold">{t("since")}</dt><dd className="m-0">{dateLong(l.created_at, locale)}</dd>
      </dl>
      {l.pair_id && l.pair_title && (
        <Link href={`/${kind === "offer" ? "needs" : "offers"}/${l.pair_id}`} className="self-start border-l-4 border-ink pl-3 font-bold text-ink">
          {t(kind === "offer" ? "pairOffer" : "pairNeed", { title: l.pair_title })}
        </Link>
      )}
      {l.tags.length > 0 && <div className="flex flex-wrap gap-2">{l.tags.map((x) => <span key={x} className={tag}>#{x}</span>)}</div>}
      {data.details && (
        <section className="flex flex-col gap-1 border-l-4 border-ink bg-surface p-4">
          <strong className="text-sm">{t("privateDetails")}</strong>
          <p className="m-0 whitespace-pre-line">{data.details}</p>
        </section>
      )}
      {fit && (
        <p className="m-0 border-l-4 border-red pl-3">
          <strong>{tl("viaLine", { title: fit.title })}</strong> · {fitReasons.join(" · ")}
        </p>
      )}
      {l.status !== "active" && <p className="m-0 font-bold">{t(`state.${l.status}`)}</p>}
      <div className="flex flex-wrap items-center gap-4">
        {!own && l.status === "active" && (
          <ContactButton listingId={l.id} ownerName={l.group_name ?? l.owner_name} ownerSeed={l.owner_seed} ownerPath={l.group_name ? null : l.owner_path} title={l.title} price={priceLabel(l, tc, locale)}
            label={t(kind === "offer" ? "ask" : "help")} signedIn={!!session} sent={data.sent} mine={data.mine} via={fit ? fit.id : null} />
        )}
        {kind === "need" && l.seeking_allies && session && !own && <AllyButton id={l.id} on={data.allied} count={l.ally_count} />}
        {own && <span className="text-sm text-muted">{t("yours")}</span>}
        {!own && session && <ReportButton type="listing" id={l.id} />}
      </div>
      {own && (
        <section id="passt" aria-labelledby="passt-h" className="flex scroll-mt-24 flex-col gap-3 border-t-2 border-ink pt-4">
          <h2 id="passt-h" className="m-0 text-xl font-bold md:text-2xl">{t(kind === "offer" ? "matchesOwnOffer" : "matchesOwnNeed")}</h2>
          <p className="m-0 max-w-[680px] text-sm text-muted">{t("matchesHow")}</p>
          {data.matches.length === 0
            ? <p className="m-0">{t("matchesNone")}</p>
            : <div className="grid gap-4 md:grid-cols-2">
                {data.matches.map((m) => <ListingCardView key={m.id} c={m} signedIn={!!session} reasons={m.reasons} sent={m.sent} mine={[{ id: l.id, title: l.title }]} via={l.id} />)}
              </div>}
        </section>
      )}
    </div>
  );
}
