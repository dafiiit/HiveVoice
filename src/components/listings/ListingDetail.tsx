import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { listingCardColumns, listingCardFrom, type ListingCard } from "@/lib/queries";
import { dateLong } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { Cover } from "../ui/Cover";
import { btn, tag } from "../ui/styles";
import { ReportButton } from "../ReportDialog";
import { ContactButton } from "./ContactButton";
import { AllyButton, ListingStatus } from "./MyListings";
import { priceLabel } from "./price";
import { ShareBlock } from "../ShareBlock";
import { EditListing } from "./EditListing";
import { AccessPanel } from "../refs/AccessPanel";
import type { AccessGrant, Scope } from "@/lib/actions/share";
import { getOrigin } from "@/lib/origin";
import { attrFacts, customFields } from "@/lib/market";
import { ListingCardView, reasonLabels } from "./ListingCardView";
import { BackLink, Notice, Page, Section } from "@/components/ui/Page";

type Match = ListingCard & { score: number; reasons: string[]; sent: boolean };

export async function ListingDetail({ id, linkToken = null, embedded = false }: { id: string; linkToken?: string | null; embedded?: boolean }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const tl = await getTranslations("listings");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [l] = await tx<ListingCard[]>`select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where l.id = ${id}`;
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
      select id, title from public.listings where owner_id = ${me} and kind <> ${l.kind} and status = 'active' order by created_at desc limit 20` : [];
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
  const kind = l.kind;
  const own = l.owner_id === me;
  const origin = await getOrigin();
  const tcat = await getTranslations("categories");
  const facts = attrFacts(l.category, l.attrs, (k, v) => tcat(k as "label", v), locale);
  const custom = customFields(l.attrs);
  // For someone else: the best of their own listings that this one fits, preselected as the reference.
  const fit = own ? null : data.matches.find((m) => m.owner_id === me) ?? null;
  const fitReasons = fit ? await reasonLabels(fit.reasons) : [];
  const tm = await getTranslations("mine");
  const author = (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <Avatar name={l.group_name ?? l.owner_name} seed={l.group_name ? undefined : l.owner_seed} path={l.group_name ? null : l.owner_path} size={28} group={!!l.group_name} />
      {l.group_slug ? <Link href={`/groups/${l.group_slug}`} className="font-bold text-ink no-underline">{l.group_name}</Link> : <Link href={`/profile/${l.owner_id}`} className="font-bold text-ink no-underline">{l.owner_name}</Link>}
      <span>{t(kind === "need" ? "needs" : "gives")}</span>
      <span className="text-muted">· {dateLong(l.created_at, locale)}</span>
    </span>
  );
  return (
    <Page width="narrow">
      {!embedded && <BackLink href={kind === "offer" ? "/community/listings?tab=offers" : "/community/listings?tab=needs"} label={tm("filters.listings")} />}
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
      <div className="flex flex-col gap-3">
        <span className="inline-flex self-start bg-chip px-2 py-0.5 text-[13px] font-bold">{tm(`kind.${kind}`)} · {tcat(`names.${l.category}` as "names.help")}</span>
        <h1 className="display m-0 break-words">{l.title}</h1>
        {author}
      </div>
      {l.description && <p className="m-0 whitespace-pre-line text-lg">{l.description}</p>}
      {l.status !== "active" && <Notice tone="status">{t(`state.${l.status}`)}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        {!own && l.status === "active" && (
          <ContactButton listingId={l.id} ownerName={l.group_name ?? l.owner_name} ownerSeed={l.owner_seed} ownerPath={l.group_name ? null : l.owner_path} title={l.title} price={priceLabel(l, tc, locale)}
            label={t(kind === "offer" ? "ask" : "help")} signedIn={!!session} sent={data.sent} mine={data.mine} via={fit ? fit.id : null} className={btn.primarySm} />
        )}
        {kind === "need" && l.seeking_allies && session && !own && <AllyButton id={l.id} on={data.allied} count={l.ally_count} />}
        <ShareBlock path={`/listings/${id}`} title={l.title} isPublic={l.read_scope === "public"} item={session ? { type: "listing", id: l.id } : null} className={btn.secondarySm}
          access={data.access ? <AccessPanel bare type="listing" id={l.id} read={data.access.read_scope} write={data.access.write_scope} hasGroup={!!l.group_slug}
          linkUrl={data.access.link_token ? `${origin}/r/listing/${l.id}?k=${data.access.link_token}` : null} grants={data.grants} path={`/listings/${id}`} /> : undefined} />
        {(own || data.canEdit) && <EditListing id={l.id} title={l.title} description={l.description} path={`/listings/${id}`} />}
        {own && <ListingStatus id={l.id} kind={kind} status={l.status} />}
        {!own && session && <span className="ml-auto"><ReportButton type="listing" id={l.id} /></span>}
      </div>
      <dl className="m-0 grid grid-cols-[minmax(110px,140px)_1fr] gap-x-4 gap-y-2 border-t border-line pt-4">
        {facts.map((f) => (<div key={f.key} className="contents"><dt className="font-bold">{f.label}</dt><dd className="m-0">{f.flag ? tcat("yes") : f.value}</dd></div>))}
        {custom.map((f, i) => (<div key={`c${i}`} className="contents"><dt className="font-bold">{f.label}</dt><dd className="m-0 whitespace-pre-line">{f.value}</dd></div>))}
        {l.goal_title && (<><dt className="font-bold">{t("forGoal")}</dt><dd className="m-0">{l.goal_title}</dd></>)}
        <dt className="font-bold">{t("where")}</dt><dd className="m-0">{l.location_text ?? l.region_name ?? "–"}</dd>
        {l.schedule_text && (<><dt className="font-bold">{t("when")}</dt><dd className="m-0">{l.schedule_text}{l.is_recurring ? ` · ${t("recurring")}` : ""}</dd></>)}
        {l.seats && (<><dt className="font-bold">{t(kind === "offer" ? "seatsLabel" : "peopleLabel")}</dt><dd className="m-0">{l.seats}</dd></>)}
        <dt className="font-bold">{t("price")}</dt><dd className="m-0">{priceLabel(l, tc, locale)}</dd>
      </dl>
      {l.pair_id && l.pair_title && (
        <Link href={`/listings/${l.pair_id}`} className="self-start font-bold text-ink underline">
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
        <Notice tone="warning" className="font-normal">
          <strong>{tl("viaLine", { title: fit.title })}</strong> · {fitReasons.join(" · ")}
        </Notice>
      )}
      {own && (
        <Section id="passt" className="scroll-mt-24" title={t(kind === "offer" ? "matchesOwnOffer" : "matchesOwnNeed")}>
          <p className="m-0 max-w-[680px] text-sm text-muted">{t("matchesHow")}</p>
          {data.matches.length === 0
            ? <Notice tone="hint" className="text-base">{t("matchesNone")}</Notice>
            : <div className="grid gap-4 md:grid-cols-2">
                {data.matches.map((m) => <ListingCardView key={m.id} c={m} signedIn={!!session} reasons={m.reasons} sent={m.sent} mine={[{ id: l.id, title: l.title }]} via={l.id} />)}
              </div>}
        </Section>
      )}
    </Page>
  );
}
