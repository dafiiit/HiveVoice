"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { decideResourceTransfer, purgeResource, restoreResource } from "@/lib/actions/links";
import { relTime } from "@/lib/format";
import { btn } from "../ui/styles";
import { ConfirmAction } from "../ui/Action";

export type DocRow = { id: string; title: string; origin: string; visibility: string; license: string | null; version_no: number; trashed_at: string | null; updated_at: string };
export type SharedRow = { id: string; title: string; level: string; owner: string };
export type IncomingTransfer = { id: string; title: string; by: string };

/** Everything one wrote or shared, what others shared with one, hand-overs, and the trash. */
export function MyDocuments({ docs, shared, incoming, trashDays, usage, title, empty, hideMine = false }: {
  docs: DocRow[]; shared: SharedRow[]; incoming: IncomingTransfer[]; trashDays: number;
  /** Storage used, shown with the uploads. */ usage: { used: string; limit: string } | null; title?: string; empty?: string;
  /** Inside Ich the list in the middle already shows them: only shared, hand-overs and trash here. */ hideMine?: boolean;
}) {
  const t = useTranslations("docrights");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = docs.filter((d) => !d.trashed_at);
  const trash = docs.filter((d) => d.trashed_at);
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      {usage && <p className="m-0 text-sm text-muted">{t("docs.usage", { used: usage.used, limit: usage.limit })}</p>}
      {incoming.map((x) => (
        <div key={x.id} role="status" className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
          <strong>{t("docs.transferText", { by: x.by, title: x.title })}</strong>
          <span className="flex gap-2">
            <button type="button" disabled={pending} className={btn.primary} onClick={() => start(async () => {
              const res = await decideResourceTransfer(x.id, true);
              setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown")); router.refresh();
            })}>{t("docs.accept")}</button>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => start(async () => { await decideResourceTransfer(x.id, false); router.refresh(); })}>{t("docs.decline")}</button>
          </span>
        </div>
      ))}
      {!hideMine && <section className="flex flex-col">
        <h2 className="m-0 border-b-2 border-ink pb-2 text-lg font-bold">{title ?? t("docs.mine")}</h2>
        {live.length === 0 && <p className="mt-3 text-muted">{empty ?? t("docs.empty")}</p>}
        {live.map((d) => (
          <Link key={d.id} href={`/links/${d.id}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-3 text-ink no-underline">
            <strong>{d.title}</strong>
            <span className="text-sm text-muted">{t(`visibility.${d.visibility}` as "visibility.me")}{d.license ? ` · ${t(`license.${d.license}` as "license.cc_by")}` : ""}{d.origin === "note" ? ` · ${t("docs.version", { n: d.version_no })}` : ""} · {relTime(d.updated_at, locale)}</span>
          </Link>
        ))}
      </section>}
      {shared.length > 0 && (
        <section className="flex flex-col">
          <h2 className="m-0 border-b-2 border-ink pb-2 text-lg font-bold">{t("docs.shared")}</h2>
          {shared.map((d) => (
            <Link key={d.id} href={`/links/${d.id}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-3 text-ink no-underline">
              <strong>{d.title}</strong><span className="text-sm text-muted">{d.owner} · {t(`access.level_${d.level}` as "access.level_view")}</span>
            </Link>
          ))}
        </section>
      )}
      <section className="flex flex-col">
        <h2 className="m-0 border-b-2 border-ink pb-2 text-lg font-bold">{t("docs.trash")}</h2>
        <p className="mb-0 mt-2 text-sm text-muted">{t("docs.trashHint", { days: trashDays })}</p>
        {trash.length === 0 && <p className="mt-3 text-muted">{t("docs.trashEmpty")}</p>}
        {trash.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3">
            <strong>{d.title}</strong>
            <span className="flex gap-3 text-sm">
              <button type="button" disabled={pending} className={`${btn.link} font-bold`} onClick={() => start(async () => { await restoreResource(d.id); router.refresh(); })}>{t("docs.restore")}</button>
              <ConfirmAction disabled={pending} look={btn.linkMuted} question={t("docs.purgeConfirm")} onConfirm={() => start(async () => { await purgeResource(d.id); router.refresh(); })} label={t("docs.purge")} />
            </span>
          </div>
        ))}
      </section>
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
    </div>
  );
}
