"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconFlag } from "./ui/Icons";
import { createReport } from "@/lib/actions/reports";
import { Dialog } from "./ui/Dialog";
import { btn, field } from "./ui/styles";
import { Notice } from "@/components/ui/Page";

const RULES = ["insult", "harassment", "threat", "illegal", "child_safety", "spam", "misinformation", "personal_data", "unsafe_link"] as const;

/** "Melden": a three-step dialog that hands the content to a citizen jury. */
/** `icon`: a small flag with the word as tooltip, for rows of icon buttons (under a post). */
export function ReportButton({ type, id, className, icon = false }: { type: "post" | "argument" | "argument_reply" | "listing" | "message" | "resource"; id: string; className?: string; icon?: boolean }) {
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rule, setRule] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const emergency = !!rule && ["illegal", "child_safety", "threat"].includes(rule) && type !== "message";
  const close = () => { setOpen(false); setStep(0); setRule(null); setNote(""); setError(null); };
  const send = () => start(async () => {
    const res = await createReport(type, id, rule!, note);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setCaseNo(res.data);
    setStep(2);
  });

  return (
    <>
      {icon
        ? <button type="button" onClick={() => setOpen(true)} aria-label={tc("report")} title={tc("report")} className={className ?? "inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-muted hover:text-ink"}><IconFlag size={18} /></button>
        : <button type="button" onClick={() => setOpen(true)} className={className ?? `${btn.linkMuted} text-sm`}>{tc("report")}</button>}
      {open && (
        <Dialog title={step === 2 ? t("sent") : t("title")} kicker={t("step", { n: step + 1 })} onClose={close}>
            {step === 0 && (
              <>
                <span className="font-bold">{t("which")}</span>
                <div role="radiogroup" aria-label={t("which")} className="flex flex-col border-t border-line">
                  {RULES.filter((r) => r !== "unsafe_link" || type === "resource").map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={rule === r} onClick={() => setRule(r)}
                      className="flex items-start gap-3 border-0 border-b border-line bg-transparent py-3 text-left text-ink">
                      <span aria-hidden="true" className={`mt-1 h-4 w-4 flex-none border border-ink ${rule === r ? "bg-ink" : ""}`} />
                      <span className="flex flex-col"><strong>{t(`rules.${r}.label`)}</strong><span className="text-sm text-muted">{t(`rules.${r}.hint`)}</span></span>
                    </button>
                  ))}
                </div>
                <p className="m-0 text-sm">{t("disagree")}</p>
                <button type="button" disabled={!rule} onClick={() => setStep(1)} className={`${btn.primary} self-start`}>{tc("next")}</button>
              </>
            )}
            {step === 1 && (
              <>
                <span>{t("rule")}: <strong>{t(`rules.${rule}.label` as "rules.insult.label")}</strong></span>
                {emergency && <Notice tone="warning" className="text-sm">{t("emergencyHint")}</Notice>}
                <label className={field.label}>{t("note")}
                  <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className={field.textarea} />
                </label>
                {error && <Notice tone="error">{error}</Notice>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(0)} className={btn.secondary}>{tc("back")}</button>
                  <button type="button" disabled={pending} onClick={send} className={btn.primary}>{t("send")}</button>
                </div>
              </>
            )}
            {step === 2 && (
              <div role="status" className="flex flex-col gap-4">
                <p className="m-0">{t("juryIntro", { caseNo })}</p>
                <ol className="m-0 flex flex-col gap-2 pl-5">
                  <li>{t("how1")}</li><li>{t("how2")}</li><li>{t("how3")}</li>
                </ol>
                <Link href="/settings?tab=reports" className={`${btn.primary} self-start`}>{t("track")}</Link>
              </div>
            )}
        </Dialog>
      )}
    </>
  );
}
