"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createReport } from "@/lib/actions/reports";
import { IconClose } from "./ui/Icons";
import { btn, field } from "./ui/styles";

const RULES = ["insult", "threat", "spam", "misinformation", "personal_data"] as const;

/** "Melden": a three-step dialog that hands the content to a citizen jury. */
export function ReportButton({ type, id, className }: { type: "post" | "argument" | "argument_reply" | "listing" | "message"; id: string; className?: string }) {
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rule, setRule] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => { setOpen(false); setStep(0); setRule(null); setNote(""); setError(null); };
  const send = () => start(async () => {
    const res = await createReport(type, id, rule!, note);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setCaseNo(res.data);
    setStep(2);
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "border-0 bg-transparent p-0 text-sm text-muted underline"}>{tc("report")}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label={t("title")} onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-5 overflow-y-auto bg-surface p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted">{t("step", { n: step + 1 })}</span>
                <h2 className="m-0 text-3xl font-bold leading-none tracking-[-0.02em]">{step === 2 ? t("sent") : t("title")}</h2>
              </div>
              <button type="button" onClick={close} aria-label={tc("close")} className="inline-flex h-11 w-11 items-center justify-center border-0 bg-transparent text-ink"><IconClose /></button>
            </div>
            {step === 0 && (
              <>
                <span className="font-bold">{t("which")}</span>
                <div role="radiogroup" aria-label={t("which")} className="flex flex-col border-t border-line">
                  {RULES.map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={rule === r} onClick={() => setRule(r)}
                      className="flex items-start gap-3 border-0 border-b border-line bg-transparent py-3 text-left text-ink">
                      <span aria-hidden="true" className={`mt-1 h-4 w-4 flex-none border border-ink ${rule === r ? "bg-ink" : ""}`} />
                      <span className="flex flex-col"><strong>{t(`rules.${r}.label`)}</strong><span className="text-sm text-muted">{t(`rules.${r}.hint`)}</span></span>
                    </button>
                  ))}
                </div>
                <p className="m-0 text-sm">{t("disagree")}</p>
                <button type="button" disabled={!rule} onClick={() => setStep(1)} className={`${btn.primaryLg} self-start`}>{tc("next")}</button>
              </>
            )}
            {step === 1 && (
              <>
                <span>{t("rule")}: <strong>{t(`rules.${rule}.label` as "rules.insult.label")}</strong></span>
                <label className={field.label}>{t("note")}
                  <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className={field.textarea} />
                </label>
                {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(0)} className={btn.secondaryLg}>{tc("back")}</button>
                  <button type="button" disabled={pending} onClick={send} className={btn.primaryLg}>{t("send")}</button>
                </div>
              </>
            )}
            {step === 2 && (
              <div role="status" className="flex flex-col gap-4">
                <p className="m-0">{t("juryIntro", { caseNo })}</p>
                <ol className="m-0 flex flex-col gap-2 pl-5">
                  <li>{t("how1")}</li><li>{t("how2")}</li><li>{t("how3")}</li>
                </ol>
                <Link href="/me?tab=reports" className={`${btn.primaryLg} self-start`}>{t("track")}</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
