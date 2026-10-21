"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { setListingStatus, toggleAlly } from "@/lib/actions/listings";
import { ToggleButton } from "../ui/Action";
import { Section } from "../ui/Page";
import { btn } from "../ui/styles";

export type MyListing = { id: string; kind: "offer" | "need"; title: string; price: string; status: string; matches: number; similar: number; ally_count: number };

export function MyListings({ items }: { items: MyListing[] }) {
  const t = useTranslations("market.mine");
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <Section title={t("title")} className="gap-0">
      {items.map((x) => { const kind = x.kind; return (
        <div key={x.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 ${x.status === "paused" ? "opacity-60" : ""}`}>
          <span className="w-14 flex-none text-sm text-muted">{t(kind === "offer" ? "gives" : "seeks")}</span>
          <Link href={`/listings/${x.id}`} className="min-w-[200px] flex-1 font-bold text-ink no-underline">{x.title}</Link>
          <span className="text-sm">{x.price}</span>
          {x.status === "paused" || x.matches === 0
            ? <span className="text-sm text-muted">{x.status === "paused" ? t("paused") : t("matches", { n: x.matches })}</span>
            : <Link href={`/listings/${x.id}#passt`} className="text-sm font-bold text-ink underline">{t("matches", { n: x.matches })} · {t("matchesLink")}</Link>}
          {kind === "need" && x.similar > 0 && <span className="text-sm font-bold">{t("similar", { n: x.similar })}</span>}
          {x.ally_count > 0 && <span className="text-sm">{t("allies", { n: x.ally_count })}</span>}
          <button type="button" disabled={pending} onClick={() => start(async () => { await setListingStatus(x.id, x.status === "paused" ? "active" : "paused", kind); })}
            className={`${btn.linkMuted} text-sm`}>{x.status === "paused" ? t("resume") : t("pause")}</button>
          <button type="button" disabled={pending} onClick={() => start(async () => { await setListingStatus(x.id, "closed", kind); })}
            className={`${btn.linkMuted} text-sm`}>{t("close")}</button>
        </div>
      ); })}
    </Section>
  );
}

export function AllyButton({ id, on, count }: { id: string; on: boolean; count: number }) {
  const t = useTranslations("market");
  return <ToggleButton on={on} size="sm" quietOn onToggle={(next) => toggleAlly(id, next)} labels={{ on: t("meTooOn", { n: count }), off: t("meToo", { n: count }) }} />;
}

/** On the own listing: pause it (it stays, nobody finds it), take it up again, or close it for good. */
export function ListingStatus({ id, kind, status }: { id: string; kind: "offer" | "need"; status: string }) {
  const t = useTranslations("market.mine");
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (next: "active" | "paused" | "closed") => start(async () => { await setListingStatus(id, next, kind); router.refresh(); });
  if (status === "closed") return null;
  return (
    <span className="flex items-center gap-3">
      <button type="button" disabled={pending} onClick={() => set(status === "paused" ? "active" : "paused")} className={btn.secondarySm}>{status === "paused" ? t("resume") : t("pause")}</button>
      <button type="button" disabled={pending} onClick={() => set("closed")} className={`${btn.linkMuted} text-sm`}>{t("close")}</button>
    </span>
  );
}
