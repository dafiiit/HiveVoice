import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ListingCard } from "@/lib/queries";
import { attrFacts } from "@/lib/market";
import { Avatar } from "../ui/Avatar";
import { Cover } from "../ui/Cover";
import { ContactButton } from "./ContactButton";
import { AllyButton } from "./MyListings";
import { priceLabel } from "./price";
import { btn, cardFrame } from "../ui/styles";

type Own = { id: string; title: string };

/** "#garten · am selben Ort": the reasons of a match, in words. */
export async function reasonLabels(reasons: string[]) {
  const t = await getTranslations("market.reasons");
  return reasons.map((r) => (r.startsWith("tag:") ? t("tag", { tag: r.slice(4) }) : t.has(r) ? t(r as "words") : r));
}

/** One card for offers and requests: same shape, photo only when there is one. */
export async function ListingCardView({ c, signedIn, why, sent, allied, reasons, mine, via }: {
  c: ListingCard; signedIn: boolean; why?: string | null; sent?: boolean; allied?: boolean;
  /** Why this card matches, shown to both sides. */
  reasons?: string[];
  /** The viewer's own listings of the other kind, and the one this card fits best. */
  mine?: Own[]; via?: string | null;
}) {
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const tcat = await getTranslations("categories");
  const locale = await getLocale();
  const who = c.group_name ?? c.owner_name;
  const price = priceLabel(c, tc, locale);
  const facts = attrFacts(c.category, c.attrs, (k, v) => tcat(k as "label", v), locale).map((f) => f.value);
  const href = `/listings/${c.id}`;
  const why2 = reasons?.length ? await reasonLabels(reasons) : [];
  return (
    <article className={cardFrame}>
      <span className="flex items-center gap-2 text-sm">
        <Avatar name={who} seed={c.group_name ? undefined : c.owner_seed} path={c.group_name ? null : c.owner_path} size={28} group={!!c.group_name} />
        <span className="min-w-0 flex-1"><strong>{who}</strong> {t(c.kind === "need" ? (c.goal_title ? "needsForGoal" : "needs") : "gives")}</span>
        <span className="flex-none bg-chip px-1.5 py-0.5 text-[12px] font-bold">{tcat(`names.${c.category}` as "names.help")}</span>
      </span>
      {c.images.length > 0 && (
        <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block">
          <Cover src={c.images[0]} ratio="16 / 9" />
          {c.images.length > 1 && <span className="absolute bottom-2 right-2 bg-ink px-2 py-0.5 text-xs font-bold text-on-ink">+{c.images.length - 1}</span>}
        </Link>
      )}
      <Link href={href} className="text-lg font-bold leading-tight text-ink no-underline hover:underline">{c.title}</Link>
      {facts.length > 0 && <span className="text-sm font-bold">{facts.slice(0, 4).join(" · ")}</span>}
      <span className="text-sm text-muted">{[c.goal_title ? t("goal", { goal: c.goal_title }) : null, c.location_text ?? c.region_name, c.schedule_text, c.seats ? t("seats", { n: c.seats }) : null].filter(Boolean).join(" · ")}</span>
      {c.pair_id && c.pair_title && (
        <Link href={`/listings/${c.pair_id}`} className="text-sm text-ink underline">{t(c.kind === "offer" ? "pairOffer" : "pairNeed", { title: c.pair_title })}</Link>
      )}
      {why && !why2.length && <span className="text-sm font-bold text-red">{t("why", { tag: why })}</span>}
      {why2.length > 0 && <span className="text-sm"><strong className="text-red">{t("matchesWhy")}</strong> {why2.join(" · ")}</span>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className={`px-2 py-1 text-sm font-bold ${c.pay_mode === "free" ? "border border-ink" : "bg-ink text-on-ink"}`}>{price}</span>
        <div className="flex items-center gap-3">
          {c.kind === "need" && c.seeking_allies && signedIn && <AllyButton id={c.id} on={!!allied} count={c.ally_count} />}
          <ContactButton listingId={c.id} ownerName={who} ownerSeed={c.owner_seed} ownerPath={c.group_name ? null : c.owner_path} title={c.title} price={price}
            label={t(c.kind === "need" ? "help" : "ask")} signedIn={signedIn} sent={sent} mine={mine} via={via} className={btn.primarySm} />
        </div>
      </div>
    </article>
  );
}
