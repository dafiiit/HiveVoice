"use client";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useDraft } from "@/lib/drafts";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { addArgument, deleteArgument, replyToArgument, toggleArgumentSupport } from "@/lib/actions/initiatives";
import { relTime } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { Glyph } from "../ui/Glyph";
import { IconCheck } from "../ui/Icons";
import { ReportButton } from "../ReportDialog";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

export type ArgumentView = {
  id: string;
  side: "pro" | "contra";
  body: string;
  sources: string[];
  author_id: string;
  author_name: string;
  author_seed: number;
  author_path: string | null;
  author_mode: "real" | "alias";
  created_at: string;
  support_count: number;
  bridge_score: number;
  supported: boolean;
  replies: { id: string; body: string; author_name: string; author_seed: number }[];
};

// A light nudge before posting: harsh wording gets a calmer suggestion.
const HARSH = /!{2,}|\b(offensichtlich|quatsch|keine ahnung|idiot|dumm|lächerlich|schwachsinn|obviously|stupid|nonsense|ridiculous)\b/i;
const calm = (t: string) =>
  t.replace(/!+/g, ".").replace(/\boffensichtlich\s/gi, "").replace(/\bobviously\s/gi, "")
    .replace(/quatsch|schwachsinn/gi, "nicht überzeugend").replace(/keine ahnung/gi, "wenig Erfahrung damit");

function Argument({ a, initiativeId, canWrite, viewerId }: { a: ArgumentView; initiativeId: string; canWrite: boolean; viewerId?: string }) {
  const t = useTranslations("arguments");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [on, setOn] = useOptimistic(a.supported);
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  useDraft(`argument-reply:${a.id}`, reply, (v) => { setReply(v); setOpen(true); });
  const [pending, start] = useTransition();
  const bridging = Number(a.bridge_score) >= 0.15;
  const count = a.support_count - (a.supported ? 1 : 0) + (on ? 1 : 0);
  return (
    <article className={`flex flex-col gap-3 bg-surface p-5 ${bridging ? "border-t-4 border-red" : "border-t border-line"}`}>
      {bridging && <span className="text-[13px] font-bold text-red">{t("bridging")}</span>}
      <p className="m-0 text-lg leading-snug">{a.body}</p>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar name={a.author_name} seed={a.author_seed} path={a.author_path} size={24} />
        <Link href={`/profile/${a.author_id}`} className="font-bold text-ink no-underline">{a.author_name}</Link>
        {a.author_mode === "real" && <IconCheck size={12} />}
        <span className="text-muted">· {relTime(a.created_at, locale)}</span>
      </span>
      {a.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {a.sources.map((s) => /^https?:\/\//.test(s)
            ? <a key={s} href={s} rel="noopener noreferrer nofollow" target="_blank" className="border border-line px-2 py-1">{new URL(s).hostname}</a>
            : <span key={s} className="border border-line px-2 py-1">{s}</span>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" aria-pressed={on} disabled={!canWrite || pending}
          onClick={() => start(async () => { setOn(!on); await toggleArgumentSupport(initiativeId, a.id, !on); })}
          className={`inline-flex h-9 items-center px-3 font-bold ${on ? "bg-ink text-on-ink" : "border border-ink bg-transparent text-ink"} disabled:opacity-60`}>
          {on ? t("supportedN", { n: count }) : t("supportN", { n: count })}
        </button>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="h-9 border-0 bg-transparent text-muted underline">
          {tc("replies", { n: a.replies.length })}
        </button>
        {viewerId === a.author_id
          ? <button type="button" onClick={() => start(async () => { await deleteArgument(initiativeId, a.id); })} className="border-0 bg-transparent text-muted underline">{tc("delete")}</button>
          : canWrite && <ReportButton type="argument" id={a.id} />}
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-l-2 border-line pl-4">
          {a.replies.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2 font-bold"><Avatar name={r.author_name} seed={r.author_seed} size={22} />{r.author_name}</span>
              <span>{r.body}</span>
            </div>
          ))}
          {canWrite && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!reply.trim()) return; start(async () => { await replyToArgument(initiativeId, a.id, reply); setReply(""); }); }}>
              <input value={reply} onChange={(e) => setReply(e.target.value)} aria-label={tc("reply")} className={field.input} />
              <button type="submit" disabled={pending} className={btn.primary}>{tc("reply")}</button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

function AddArgument({ side, initiativeId }: { side: "pro" | "contra"; initiativeId: string }) {
  const t = useTranslations("arguments");
  const tc = useTranslations("common");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [tone, setTone] = useState(false);
  useDraft(`argument:${initiativeId}:${side}`, { body, source }, (v) => { setBody(v.body); setSource(v.source); });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const post = (text: string) => start(async () => {
    const res = await addArgument(initiativeId, side, text, [source.trim()]);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setBody(""); setSource(""); setTone(false); setError(null);
  });
  return (
    <form className="flex flex-col gap-3 border-t border-line pt-4" onSubmit={(e) => {
      e.preventDefault();
      if (body.trim().length < 10) return setError(t("tooShort"));
      if (HARSH.test(body) && !tone) return setTone(true);
      post(body);
    }}>
      <label className={field.label}>{t(side === "pro" ? "addPro" : "addContra")}
        <textarea rows={3} value={body} onChange={(e) => { setBody(e.target.value); setTone(false); }} placeholder={t("placeholder")} className={field.textarea} />
      </label>
      <label className={field.label}>{t("source")} <span className={field.hint}>{tc("optional")}</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("sourcePlaceholder")} className={field.input} />
      </label>
      <span className={field.hint}>{t("rule")}</span>
      {tone && (
        <div role="status" className="flex flex-col gap-2 border-l-4 border-red bg-surface p-3">
          <strong>{t("toneTitle")}</strong>
          <span>{t("toneSuggestion", { text: calm(body) })}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => post(calm(body))} className={btn.primary}>{t("useSuggestion")}</button>
            <button type="button" onClick={() => post(body)} className={btn.secondary}>{t("keep")}</button>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!tone && <button type="submit" disabled={pending} className={`${btn.primary} self-start`}>{t("add")}</button>}
    </form>
  );
}

export function ArgumentBoard({ initiativeId, args, canWrite, viewerId }: { initiativeId: string; args: ArgumentView[]; canWrite: boolean; viewerId?: string }) {
  const t = useTranslations("arguments");
  const [sort, setSort] = useState<"bridge" | "new" | "most">("bridge");
  const [side, setSide] = useState<"pro" | "contra">("pro");
  const sorted = useMemo(() => {
    const s = [...args];
    if (sort === "bridge") s.sort((a, b) => Number(b.bridge_score) - Number(a.bridge_score) || b.support_count - a.support_count);
    if (sort === "new") s.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sort === "most") s.sort((a, b) => b.support_count - a.support_count);
    return s;
  }, [args, sort]);
  const cols = (["pro", "contra"] as const).map((k) => ({ k, items: sorted.filter((a) => a.side === k) }));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <div role="group" aria-label={t("side")} className="flex md:hidden">
          {cols.map((c) => (
            <button key={c.k} type="button" aria-pressed={side === c.k} onClick={() => setSide(c.k)}
              className={`h-11 px-4 font-bold ${side === c.k ? "bg-ink text-on-ink" : "border border-ink bg-transparent text-ink"}`}>
              {c.k === "pro" ? "+ " : "− "}{t(c.k)} · {c.items.length}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">{t("sort")}
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-11 border border-ink bg-surface px-2 font-normal text-ink">
            <option value="bridge">{t("sortBridge")}</option>
            <option value="new">{t("sortNew")}</option>
            <option value="most">{t("sortMost")}</option>
          </select>
        </label>
        <span className="max-w-[520px] text-sm text-muted">{t("bridgeExplained")}</span>
      </div>
      <div className="grid gap-8 @2xl:grid-cols-2">
        {cols.map((c) => (
          <section key={c.k} aria-label={t(c.k)} className={`${side === c.k ? "flex" : "hidden"} flex-col gap-4 md:flex`}>
            <h2 className="m-0 flex items-center gap-3 text-2xl font-bold">
              <Glyph shape={c.k === "pro" ? "plus" : "pill"} size={36} />
              {t(c.k)} · {c.items.length}
            </h2>
            {c.items.length === 0 && <p className="m-0 text-muted">{t(c.k === "pro" ? "emptyPro" : "emptyContra")}</p>}
            {c.items.map((a) => <Argument key={a.id} a={a} initiativeId={initiativeId} canWrite={canWrite} viewerId={viewerId} />)}
            {canWrite && <AddArgument side={c.k} initiativeId={initiativeId} />}
          </section>
        ))}
      </div>
    </div>
  );
}
