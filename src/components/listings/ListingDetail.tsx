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

export async function ListingDetail({ id, kind }: { id: string; kind: "offer" | "need" }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [l] = await tx<ListingCard[]>`select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where l.id = ${id} and l.kind = ${kind}`;
    if (!l) return null;
    const [{ details }] = await tx<{ details: string | null }[]>`select app.listing_private_details(${id}) as details`;
    const sent = me ? (await tx`select 1 from public.contact_requests where listing_id = ${id} and from_profile_id = ${me} and status in ('pending', 'accepted')`).length > 0 : false;
    const allied = me ? (await tx`select 1 from public.listing_allies where listing_id = ${id} and profile_id = ${me}`).length > 0 : false;
    return { l, details, sent, allied };
  });
  if (!data) notFound();
  const { l } = data;
  const own = l.owner_id === me;
  return (
    <div className="flex max-w-[860px] flex-col gap-6 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-12">
      <nav aria-label={t("breadcrumb")} className="flex gap-2 text-sm">
        <Link href={kind === "offer" ? "/needs?tab=near" : "/offers?tab=near"} className="text-ink">{t(kind === "offer" ? "allOffers" : "allNeeds")}</Link>
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
      <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-t border-line pt-4">
        {l.goal_title && (<><dt className="font-bold">{t("forGoal")}</dt><dd className="m-0">{l.goal_title}</dd></>)}
        <dt className="font-bold">{t("where")}</dt><dd className="m-0">{l.location_text ?? l.region_name ?? "–"}</dd>
        {l.schedule_text && (<><dt className="font-bold">{t("when")}</dt><dd className="m-0">{l.schedule_text}{l.is_recurring ? ` · ${t("recurring")}` : ""}</dd></>)}
        {l.seats && (<><dt className="font-bold">{t(kind === "offer" ? "seatsLabel" : "peopleLabel")}</dt><dd className="m-0">{l.seats}</dd></>)}
        <dt className="font-bold">{t("price")}</dt><dd className="m-0">{priceLabel(l, tc, locale)}</dd>
        <dt className="font-bold">{t("since")}</dt><dd className="m-0">{dateLong(l.created_at, locale)}</dd>
      </dl>
      {l.tags.length > 0 && <div className="flex flex-wrap gap-2">{l.tags.map((x) => <span key={x} className={tag}>#{x}</span>)}</div>}
      {data.details && (
        <section className="flex flex-col gap-1 border-l-4 border-ink bg-surface p-4">
          <strong className="text-sm">{t("privateDetails")}</strong>
          <p className="m-0 whitespace-pre-line">{data.details}</p>
        </section>
      )}
      {l.status !== "active" && <p className="m-0 font-bold">{t(`state.${l.status}`)}</p>}
      <div className="flex flex-wrap items-center gap-4">
        {!own && l.status === "active" && (
          <ContactButton listingId={l.id} ownerName={l.group_name ?? l.owner_name} ownerSeed={l.owner_seed} ownerPath={l.group_name ? null : l.owner_path} title={l.title} price={priceLabel(l, tc, locale)}
            label={t(kind === "offer" ? "ask" : "help")} signedIn={!!session} sent={data.sent} />
        )}
        {kind === "need" && l.seeking_allies && session && !own && <AllyButton id={l.id} on={data.allied} count={l.ally_count} />}
        {own && <span className="text-sm text-muted">{t("yours")}</span>}
        {!own && session && <ReportButton type="listing" id={l.id} />}
      </div>
    </div>
  );
}
