"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { forwardRequest, respondRequest } from "@/lib/actions/responsible";
import { dateLong, relTime } from "@/lib/format";
import { btn, chip, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

export type IntakeItem = { id: string; body: string; created_at: string; due_at: string; status: string; decision: string | null; response_body: string | null;
  author: string; resp_title: string; initiative_id: string | null; initiative_title: string | null; group_slug: string | null; group_name: string | null; supporters: number | null };

function Item({ r, others }: { r: IntakeItem; others: { id: string; label: string }[] }) {
  const t = useTranslations("responsible.intake");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [mode, setMode] = useState<null | "answer" | "forward">(null);
  const [decision, setDecision] = useState<"accepted" | "partial" | "rejected" | "info">("accepted");
  const [body, setBody] = useState("");
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const overdue = r.status === "open" && new Date(r.due_at) < new Date();
  return (
    <article className="flex flex-col gap-2 border-b border-line py-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{r.resp_title} · {t("received", { when: relTime(r.created_at, locale) })}</span>
        <span className={overdue ? "font-bold text-red" : "font-bold"}>{r.status === "open" ? t("due", { date: dateLong(r.due_at, locale) }) : t(`status.${r.status}`)}</span>
      </div>
      {(r.initiative_title || r.group_name) && (
        <Link href={r.initiative_id ? `/initiatives/${r.initiative_id}` : `/groups/${r.group_slug}`} className="text-lg font-bold text-ink">{r.initiative_title ?? r.group_name}</Link>
      )}
      <p className="m-0">{r.body}</p>
      <span className="text-sm text-muted">{t("from", { name: r.author })}{r.supporters ? ` · ${t("supporters", { n: r.supporters })}` : ""}</span>
      {r.response_body && <Notice tone="status" className="font-normal">{r.response_body}</Notice>}
      {r.status === "open" && !mode && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("answer")} className={btn.primary}>{t("answer")}</button>
          {others.length > 0 && <button type="button" onClick={() => setMode("forward")} className={btn.secondary}>{t("forward")}</button>}
        </div>
      )}
      {mode === "answer" && (
        <div className="flex flex-col gap-3 border border-line bg-surface p-3">
          <div role="radiogroup" aria-label={t("decision")} className="flex flex-wrap gap-2">
            {(["accepted", "partial", "rejected", "info"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={decision === d} onClick={() => setDecision(d)} className={chip(decision === d)}>{t(`decisions.${d}`)}</button>)}
          </div>
          <label className={field.label}>{t("reason")}<textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className={field.textarea} /></label>
          <span className={field.hint}>{t("public")}</span>
          {error && <p role="alert" className="m-0 font-bold">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={pending || body.trim().length < 5} onClick={() => start(async () => {
              const res = await respondRequest(r.id, decision, body);
              if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
              setMode(null);
            })} className={btn.primary}>{t("publish")}</button>
            <button type="button" onClick={() => setMode(null)} className={btn.secondary}>{tc("cancel")}</button>
          </div>
        </div>
      )}
      {mode === "forward" && (
        <div className="flex flex-col gap-3 border border-line bg-surface p-3">
          <label className={field.label}>{t("forwardTo")}
            <select value={to} onChange={(e) => setTo(e.target.value)} className={field.select}>{others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <label className={field.label}>{t("note")}<input value={body} onChange={(e) => setBody(e.target.value)} className={field.input} /></label>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => start(async () => { await forwardRequest(r.id, to, body); setMode(null); })} className={btn.primary}>{t("forward")}</button>
            <button type="button" onClick={() => setMode(null)} className={btn.secondary}>{tc("cancel")}</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function Intake({ items, others }: { items: IntakeItem[]; others: { id: string; label: string }[] }) {
  const t = useTranslations("responsible.intake");
  if (!items.length) return <p className="m-0 text-muted">{t("empty")}</p>;
  return <div className="flex flex-col">{items.map((r) => <Item key={r.id} r={r} others={others} />)}</div>;
}
