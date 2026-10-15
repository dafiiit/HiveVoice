"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formWorkingGroup, markDone, startBallot, withdraw } from "@/lib/actions/initiatives";
import { btn, field } from "../ui/styles";

export function AuthorTools({ id, phase, outcome, hasBallot, hasGroup, title }: {
  id: string; phase: string; outcome: string | null; hasBallot: boolean; hasGroup: boolean; title: string;
}) {
  const t = useTranslations("initiative.author");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(title.endsWith("?") ? title : "");
  const [days, setDays] = useState(7);
  const [quorum, setQuorum] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    if (!res.ok && res.error) setError(tc(`errors.${res.error}` as "errors.unknown"));
  });
  if (outcome) return null;
  return (
    <section aria-label={t("title")} className="flex flex-col gap-3 border border-line bg-surface p-4">
      <strong className="text-sm">{t("title")}</strong>
      <div className="flex flex-wrap gap-2">
        <Link href={`/initiatives/${id}/edit`} className={btn.secondary}>{tc("edit")}</Link>
        {phase === "debate" && !hasBallot && <button type="button" onClick={() => setOpen(!open)} className={btn.primary}>{t("startVote")}</button>}
        {(phase === "addressee" || phase === "implementation") && !hasGroup && (
          <button type="button" disabled={pending} onClick={() => act(() => formWorkingGroup(id))} className={btn.secondary}>{t("formGroup")}</button>
        )}
        {phase === "implementation" && <button type="button" disabled={pending} onClick={() => act(() => markDone(id))} className={btn.secondary}>{t("markDone")}</button>}
        <button type="button" disabled={pending} onClick={() => { if (confirm(t("withdrawConfirm"))) act(() => withdraw(id)); }} className={btn.ghost}>{t("withdraw")}</button>
      </div>
      {phase === "idea" && <span className="text-sm text-muted">{t("ideaHint")}</span>}
      {open && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await startBallot(id, question, days, quorum); if (r.ok) setOpen(false); return r; }); }}>
          <label className={field.label}>{t("question")}
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("questionPlaceholder")} className={field.inputSm} required minLength={8} />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className={field.label}>{t("days")}
              <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${field.inputSm} w-28`} />
            </label>
            <label className={field.label}>{t("quorum")}
              <input type="number" min={0} max={100} value={quorum} onChange={(e) => setQuorum(Number(e.target.value))} className={`${field.inputSm} w-28`} />
            </label>
          </div>
          <span className={field.hint}>{t("voteHint")}</span>
          <button type="submit" disabled={pending} className={`${btn.primary} self-start`}>{t("startVote")}</button>
        </form>
      )}
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
    </section>
  );
}
