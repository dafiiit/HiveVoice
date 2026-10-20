"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RefCard } from "@/lib/refs";

/** A card for something passed on: an offer, a document, a group, a task, an initiative. */
export function RefCardView({ card }: { card: RefCard | "missing" | null }) {
  const t = useTranslations("refs");
  if (!card) return null;
  if (card === "missing") return <span className="block border border-dashed border-line-strong p-3 text-sm text-muted">{t("missing")}</span>;
  const label = card.type === "listing" ? t(card.kind === "need" ? "need" : "offer") : t(`types.${card.type}`);
  const sub = card.type === "group" ? t("members", { n: Number(card.sub ?? 0) })
    : card.type === "task" ? [t.has(`status.${card.kind}`) ? t(`status.${card.kind}` as "status.open") : null, card.sub].filter(Boolean).join(" · ")
    : card.sub;
  return (
    <Link href={card.href} className="flex flex-col gap-0.5 border border-ink border-l-[6px] bg-surface p-3 text-ink no-underline hover:bg-paper">
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      <strong className="leading-tight">{card.title}</strong>
      {sub && <span className="line-clamp-2 text-sm text-muted">{sub}</span>}
    </Link>
  );
}
