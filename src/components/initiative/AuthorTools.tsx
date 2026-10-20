"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cancelBallot, deleteInitiative, formWorkingGroup, markDone, startBallot, withdraw } from "@/lib/actions/initiatives";
import { btn, field } from "../ui/styles";
import { ConfirmAction, useAction } from "../ui/Action";
import { Notice } from "@/components/ui/Page";

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
  const { run: exec, pending, error } = useAction();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => exec(fn, { refresh: false, onOk: () => { setOpen(null); setReason(""); } });
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
          <ConfirmAction disabled={pending} look={btn.ghost} question={tr("deleteConfirm")} onConfirm={() => act(() => deleteInitiative(id))} label={tr("delete")} />
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
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("questionPlaceholder")} className={field.input} required minLength={8} />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className={field.label}>{t("days")}
              <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${field.input} w-28`} />
            </label>
            <label className={field.label}>{t("quorum")}
              <input type="number" min={0} max={100} value={quorum} onChange={(e) => setQuorum(Number(e.target.value))} className={`${field.input} w-28`} />
            </label>
          </div>
          <span className={field.hint}>{t("voteHint")}</span>
          <button type="submit" disabled={pending || !hurdlesMet} className={`${btn.primary} self-start`}>{t("startVote")}</button>
        </form>
      )}
      {open === "cancel" && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); act(() => cancelBallot(id, reason)); }}>
          <label className={field.label}>{tr("cancelReason")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={field.input} required minLength={10} />
          </label>
          <span className={field.hint}>{tr("cancelHint")}</span>
          <button type="submit" disabled={pending || reason.trim().length < 10} className={`${btn.red} self-start`}>{tr("cancelConfirm")}</button>
        </form>
      )}
      {open === "withdraw" && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); act(() => withdraw(id, reason)); }}>
          <label className={field.label}>{tr("withdrawNote")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={field.input} />
          </label>
          <span className={field.hint}>{tr("withdrawHint")}</span>
          <button type="submit" disabled={pending} className={`${btn.red} self-start`}>{tr("withdrawConfirm")}</button>
        </form>
      )}
      {error && <Notice tone="error" className="text-sm">{error}</Notice>}
    </section>
  );
}
