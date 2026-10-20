"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { declineJury, decideJury } from "@/lib/actions/jury";
import { Glyph } from "../ui/Glyph";
import { btn, field } from "../ui/styles";

export function JuryReview({ caseId, caseNo, rule, context, target, decided, status, jurySize }: {
  caseId: string; caseNo: string; rule: string; context: string | null; target: string | null; decided: boolean; status: string; jurySize: number;
}) {
  const t = useTranslations("jury");
  const tr = useTranslations("report.rules");
  const [step, setStep] = useState<"invite" | "review" | "done">(decided || status !== "open" ? "done" : "invite");
  const [choice, setChoice] = useState<"violation" | "no_violation" | "unsure" | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState(status);
  const [pending, start] = useTransition();
  if (step === "invite") {
    return (
      <section className="flex max-w-[720px] flex-col gap-6">
        <div className="flex items-end"><Glyph shape="dots" size={120} /><Glyph shape="burst" size={56} color="var(--red)" /></div>
        <h1 className="display m-0">{t("invited")}</h1>
        <p className="m-0 text-xl">{t("inviteText", { n: jurySize })}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setStep("review")} className={btn.primary}>{t("start")}</button>
          <button type="button" disabled={pending} onClick={() => start(async () => { await declineJury(caseId); setStep("done"); setResult("declined"); })} className={btn.ghost}>{t("notNow")}</button>
        </div>
      </section>
    );
  }
  if (step === "review") {
    return (
      <section className="flex max-w-[760px] flex-col gap-6">
        <span className="text-sm">{t("caseLine", { no: caseNo, rule: tr(`${rule}.label` as "insult.label") })}</span>
        <h1 className="display m-0">{t("question")}</h1>
        {context && (
          <div className="flex gap-3 border border-line bg-surface p-4">
            <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center bg-chip font-bold">B</span>
            <div className="flex flex-col gap-1"><span className="text-sm text-muted">{t("context")}</span><span>{context}</span></div>
          </div>
        )}
        <div className="flex gap-3 border-2 border-ink bg-surface p-4">
          <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center bg-ink font-bold text-on-ink">A</span>
          <div className="flex flex-col gap-1"><span className="text-sm text-muted">{t("reported")}</span><span className="text-lg">„{target}“</span></div>
        </div>
        <div className="flex flex-col gap-1 border-l-4 border-ink pl-3">
          <strong>{t("rule", { rule: tr(`${rule}.label` as "insult.label") })}</strong>
          <span>{tr(`${rule}.hint` as "insult.hint")}. {t("hardCritique")}</span>
        </div>
        <div role="radiogroup" aria-label={t("yourView")} className="grid gap-2 sm:grid-cols-3">
          {([["violation", "plus"], ["no_violation", "circle"], ["unsure", "hourglass"]] as const).map(([k, shape]) => (
            <button key={k} type="button" role="radio" aria-checked={choice === k} onClick={() => setChoice(k)}
              className={`flex items-center gap-3 p-4 text-left ${choice === k ? "bg-ink text-on-ink" : "border border-line bg-surface text-ink"}`}>
              <Glyph shape={shape} size={28} color={choice === k ? "var(--on-ink)" : "var(--ink)"} /> <strong>{t(`choices.${k}`)}</strong>
            </button>
          ))}
        </div>
        <label className={field.label}>{t("reason")}<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={field.textarea} /></label>
        <button type="button" disabled={!choice || pending} onClick={() => start(async () => {
          const res = await decideJury(caseId, choice!, reason);
          if (res.ok) { setResult(res.data); setStep("done"); }
        })} className={`${btn.primary} self-start`}>{t("submit")}</button>
      </section>
    );
  }
  return (
    <section role="status" className="flex max-w-[720px] flex-col gap-6">
      <Glyph shape="flower" size={120} />
      <h1 className="display m-0">{result === "declined" ? t("declinedTitle") : t("thanks")}</h1>
      <p className="m-0 text-xl">{result === "upheld" ? t("upheld") : result === "dismissed" ? t("dismissed") : result === "declined" ? t("declinedText") : t("waiting")}</p>
      <Link href="/connect" className={`${btn.primary} self-start`}>{t("home")}</Link>
    </section>
  );
}
