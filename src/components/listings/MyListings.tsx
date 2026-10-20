"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { setListingStatus, toggleAlly } from "@/lib/actions/listings";

export type MyListing = { id: string; title: string; price: string; status: string; matches: number; similar: number; ally_count: number };

export function MyListings({ kind, items }: { kind: "offer" | "need"; items: MyListing[] }) {
  const t = useTranslations("market.mine");
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <section aria-label={t(kind)} className="flex flex-col">
      <h2 className="m-0 mb-2 text-xl font-bold md:text-2xl">{t(kind)}</h2>
      {items.map((x) => (
        <div key={x.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 ${x.status === "paused" ? "opacity-60" : ""}`}>
          <Link href={`/${kind === "offer" ? "offers" : "needs"}/${x.id}`} className="min-w-[200px] flex-1 font-bold text-ink no-underline">{x.title}</Link>
          <span className="text-sm">{x.price}</span>
          {x.status === "paused" || x.matches === 0
            ? <span className="text-sm text-muted">{x.status === "paused" ? t("paused") : t("matches", { n: x.matches })}</span>
            : <Link href={`/${kind === "offer" ? "offers" : "needs"}/${x.id}#passt`} className="text-sm font-bold text-ink">{t("matches", { n: x.matches })} · {t("matchesLink")}</Link>}
          {kind === "need" && x.similar > 0 && <span className="text-sm font-bold">{t("similar", { n: x.similar })}</span>}
          {x.ally_count > 0 && <span className="text-sm">{t("allies", { n: x.ally_count })}</span>}
          <button type="button" disabled={pending} onClick={() => start(async () => { await setListingStatus(x.id, x.status === "paused" ? "active" : "paused", kind); })}
            className="border-0 bg-transparent text-sm text-muted underline">{x.status === "paused" ? t("resume") : t("pause")}</button>
          <button type="button" disabled={pending} onClick={() => start(async () => { await setListingStatus(x.id, "closed", kind); })}
            className="border-0 bg-transparent text-sm text-muted underline">{t("close")}</button>
        </div>
      ))}
    </section>
  );
}

export function AllyButton({ id, on, count }: { id: string; on: boolean; count: number }) {
  const t = useTranslations("market");
  const [pending, start] = useTransition();
  return (
    <button type="button" aria-pressed={on} disabled={pending} onClick={() => start(async () => { await toggleAlly(id, !on); })}
      className={`h-9 border-0 bg-transparent p-0 text-sm ${on ? "font-bold text-ink" : "text-muted underline"}`}>
      {on ? t("meTooOn", { n: count }) : t("meToo", { n: count })}
    </button>
  );
}
