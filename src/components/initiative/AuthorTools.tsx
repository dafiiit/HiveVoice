"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cancelBallot, deleteInitiative, formWorkingGroup, markDone, startBallot, withdraw } from "@/lib/actions/initiatives";
import { btn, field } from "../ui/styles";

export function AuthorTools({ id, phase, outcome, hasBallot, hasGroup, title, isLead, supports, needed, debateUntil, frozen, deletable }: {
  id: string; phase: string; outcome: string | null; hasBallot: boolean; hasGroup: boolean; title: string;
  isLead: boolean; supports: number; needed: number; debateUntil: string | null; frozen: boolean; deletable: boolean;
}) {
  const t = useTranslations("initiative.author");
  const tr = useTranslations("inirights.tools");
  const tc = useTranslations("common");
  const [open, setOpen] = useState<"vote" | "cancel" | "withdraw" | null>(null);
  const [question, setQuestion] = useState(title.endsWith("?") ? title : "");
  const [days, setDays] = useState(7);
  const [quorum, setQuorum] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    if (res.ok) { setOpen(null); setReason(""); }
  });
  if (outcome) return null;
  const hurdlesMet = supports >= needed && !debateUntil;
  const toggle = (k: "vote" | "cancel" | "withdraw") => setOpen(open === k ? null : k);
  return (
    <section aria-label={t("title")} className="flex flex-col gap-3 border border-line bg-surface p-4">
      <strong className="text-sm">{t("title")}</strong>
      {frozen && <span className="text-sm">{tr("frozen")}</span>}
      <div className="flex flex-wrap gap-2">
        <Link href={`/initiatives/${id}/edit`} className={btn.secondary}>{tc("edit")}</Link>
        {phase === "debate" && !hasBallot && <button type="button" onClick={() => toggle("vote")} className={btn.primary}>{t("startVote")}</button>}
        {hasBallot && <button type="button" onClick={() => toggle("cancel")} className={btn.secondary}>{tr("cancelVote")}</button>}
        {(phase === "addressee" || phase === "implementation") && !hasGroup && (
          <button type="button" disabled={pending} onClick={() => act(() => formWorkingGroup(id))} className={btn.secondary}>{t("formGroup")}</button>
        )}
        {phase === "implementation" && <button type="button" disabled={pending} onClick={() => act(() => markDone(id))} className={btn.secondary}>{t("markDone")}</button>}
        {isLead && <button type="button" onClick={() => toggle("withdraw")} className={btn.ghost}>{t("withdraw")}</button>}
        {isLead && deletable && (
          <button type="button" disabled={pending} onClick={() => { if (confirm(tr("deleteConfirm"))) act(() => deleteInitiative(id)); }} className={btn.ghost}>{tr("delete")}</button>
        )}
      </div>
      {phase === "idea" && <span className="text-sm text-muted">{t("ideaHint")}</span>}
      {phase === "debate" && !hasBallot && (
        <span className="text-sm text-muted">
          {hurdlesMet ? tr("ready") : [supports < needed ? tr("needed", { needed, have: supports }) : null, debateUntil ? tr("debateUntil", { date: debateUntil }) : null].filter(Boolean).join(" ")}
        </span>
      )}
      {isLead && deletable && <span className="text-sm text-muted">{tr("deleteHint")}</span>}
      {open === "vote" && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); act(() => startBallot(id, question, days, quorum)); }}>
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
          <button type="submit" disabled={pending || !hurdlesMet} className={`${btn.primary} self-start`}>{t("startVote")}</button>
        </form>
      )}
      {open === "cancel" && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); act(() => cancelBallot(id, reason)); }}>
          <label className={field.label}>{tr("cancelReason")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={field.inputSm} required minLength={10} />
          </label>
          <span className={field.hint}>{tr("cancelHint")}</span>
          <button type="submit" disabled={pending || reason.trim().length < 10} className={`${btn.red} self-start`}>{tr("cancelConfirm")}</button>
        </form>
      )}
      {open === "withdraw" && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); if (confirm(t("withdrawConfirm"))) act(() => withdraw(id, reason)); }}>
          <label className={field.label}>{tr("withdrawNote")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={field.inputSm} />
          </label>
          <span className={field.hint}>{tr("withdrawHint")}</span>
          <button type="submit" disabled={pending} className={`${btn.red} self-start`}>{tr("withdrawConfirm")}</button>
        </form>
      )}
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
    </section>
  );
}
