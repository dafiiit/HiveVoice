import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ListingCard } from "@/lib/queries";
import { Avatar } from "../ui/Avatar";
import { Cover } from "../ui/Cover";
import { ContactButton } from "./ContactButton";
import { AllyButton } from "./MyListings";
import { priceLabel } from "./price";

/** One card for offers and requests: same shape, photo only when there is one. */
export async function ListingCardView({ c, signedIn, why, sent, allied }: { c: ListingCard; signedIn: boolean; why?: string | null; sent?: boolean; allied?: boolean }) {
  const t = await getTranslations("market");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const who = c.group_name ?? c.owner_name;
  const price = priceLabel(c, tc, locale);
  return (
    <article className="flex flex-col gap-3 border border-ink border-t-[6px] bg-surface p-4">
      <span className="flex items-center gap-2 text-sm">
        <Avatar name={who} seed={c.group_name ? undefined : c.owner_seed} path={c.group_name ? null : c.owner_path} size={28} group={!!c.group_name} />
        <span><strong>{who}</strong> {t(c.kind === "need" ? (c.goal_title ? "needsForGoal" : "needs") : "gives")}</span>
      </span>
      {c.images.length > 0 && (
        <Link href={`/${c.kind === "offer" ? "offers" : "needs"}/${c.id}`} tabIndex={-1} aria-hidden="true" className="relative block">
          <Cover src={c.images[0]} ratio="16 / 9" />
          {c.images.length > 1 && <span className="absolute bottom-2 right-2 bg-ink px-2 py-0.5 text-xs font-bold text-on-ink">+{c.images.length - 1}</span>}
        </Link>
      )}
      <Link href={`/${c.kind === "offer" ? "offers" : "needs"}/${c.id}`} className="text-lg font-bold leading-tight text-ink no-underline hover:underline">{c.title}</Link>
      <span className="text-sm text-muted">{[c.goal_title ? t("goal", { goal: c.goal_title }) : null, c.location_text ?? c.region_name, c.schedule_text, c.seats ? t("seats", { n: c.seats }) : null].filter(Boolean).join(" · ")}</span>
      {why && <span className="text-sm font-bold text-red">{t("why", { tag: why })}</span>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className={`px-2 py-1 text-sm font-bold ${c.pay_mode === "free" ? "border border-ink" : "bg-ink text-on-ink"}`}>{price}</span>
        <div className="flex items-center gap-3">
          {c.kind === "need" && c.seeking_allies && signedIn && <AllyButton id={c.id} on={!!allied} count={c.ally_count} />}
          <ContactButton listingId={c.id} ownerName={who} ownerSeed={c.owner_seed} ownerPath={c.group_name ? null : c.owner_path} title={c.title} price={price}
            label={t(c.kind === "need" ? "help" : "ask")} signedIn={signedIn} sent={sent} />
        </div>
      </div>
    </article>
  );
}
