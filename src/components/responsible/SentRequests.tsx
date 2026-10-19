"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { markUnanswered, redirectRequest } from "@/lib/actions/responsible";
import { dateLong } from "@/lib/format";
import { btn, field } from "../ui/styles";

export type SentItem = { id: string; body: string; created_at: string; due_at: string; status: string; response_body: string | null; unanswered_at: string | null;
  overdue: boolean; resp_title: string; org: string | null; initiative_id: string | null; initiative_title: string | null };

function Row({ r, others }: { r: SentItem; others: { id: string; label: string }[] }) {
  const t = useTranslations("resprights.sent");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [mode, setMode] = useState(false);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    if (res.ok) setMode(false);
  });
  return (
    <article className="flex flex-col gap-2 border-b border-line py-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{t("to", { who: [r.org, r.resp_title].filter(Boolean).join(" · ") })}</span>
        <span className={r.overdue ? "font-bold text-red" : "font-bold"}>
          {r.status === "open" ? (r.overdue ? t("overdue", { date: dateLong(r.due_at, locale) }) : t("due", { date: dateLong(r.due_at, locale) })) : t(r.status === "answered" ? "answered" : "forwarded")}
        </span>
      </div>
      {r.initiative_title && <Link href={`/initiatives/${r.initiative_id}`} className="text-lg font-bold text-ink">{r.initiative_title}</Link>}
      <p className="m-0">{r.body}</p>
      {r.response_body && <p className="m-0 border-l-4 border-ink pl-3">{r.response_body}</p>}
      {r.status === "open" && r.overdue && !mode && (
        <div className="flex flex-wrap items-center gap-2">
          {others.length > 0 && <button type="button" onClick={() => setMode(true)} className={btn.secondary}>{t("redirect")}</button>}
          {r.unanswered_at
            ? <span role="status" className="text-sm font-bold">{t("marked")}</span>
            : <button type="button" disabled={pending} onClick={() => act(() => markUnanswered(r.id))} className={btn.ghost}>{t("mark")}</button>}
        </div>
      )}
      {mode && (
        <div className="flex flex-wrap items-end gap-2 border border-line bg-surface p-3">
          <label className={field.label}>{t("redirectTo")}
            <select value={to} onChange={(e) => setTo(e.target.value)} className={`${field.select} h-11`}>{others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <button type="button" disabled={pending} onClick={() => act(() => redirectRequest(r.id, to))} className={btn.primary}>{t("redirectSend")}</button>
          <button type="button" onClick={() => setMode(false)} className={btn.secondary}>{tc("cancel")}</button>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </article>
  );
}

export function SentRequests({ items, others }: { items: SentItem[]; others: { id: string; label: string }[] }) {
  const t = useTranslations("resprights.sent");
  if (!items.length) return <p className="m-0 text-muted">{t("empty")}</p>;
  return <div className="flex flex-col">{items.map((r) => <Row key={r.id} r={r} others={others} />)}</div>;
}
