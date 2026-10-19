"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { appealReport } from "@/lib/actions/reports";
import { btn, field } from "../ui/styles";

/** Einspruch: once, within two weeks, heard by a different jury. */
export function Appeal({ reportId, days }: { reportId: string; days: number }) {
  const t = useTranslations("modrights.mine");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${btn.secondary} self-start`}>{t("appealButton")}</button>;
  return (
    <form className="flex max-w-[520px] flex-col gap-2 border border-line bg-surface p-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await appealReport(reportId, reason);
        if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
        setOpen(false); router.refresh();
      });
    }}>
      <label className={field.label}>{t("appealReason")}<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={field.textarea} minLength={10} required /></label>
      <span className={field.hint}>{t("appealHint", { days })}</span>
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <span className="flex gap-2">
        <button type="submit" disabled={pending || reason.trim().length < 10} className={btn.primary}>{t("appealSend")}</button>
        <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
      </span>
    </form>
  );
}
