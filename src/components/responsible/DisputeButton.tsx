"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { disputeResponsibility } from "@/lib/actions/responsible";
import { btn, field } from "../ui/styles";

/** Somebody says the declaration is wrong: 14 days for evidence, then seven people from the region decide. */
export function DisputeButton({ id, days }: { id: string; days: number }) {
  const t = useTranslations("resprights.dispute");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="border-0 bg-transparent p-0 text-sm text-muted underline">{t("button")}</button>;
  return (
    <form className="flex w-full max-w-[520px] flex-col gap-2 border border-line bg-surface p-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await disputeResponsibility(id, claim);
        if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
        router.push(`/responsible/dispute/${res.data}`);
      });
    }}>
      <label className={field.label}>{t("label")}<textarea rows={3} value={claim} onChange={(e) => setClaim(e.target.value)} className={field.textarea} minLength={10} required /></label>
      <span className={field.hint}>{t("help", { days })}</span>
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <span className="flex gap-2">
        <button type="submit" disabled={pending || claim.trim().length < 10} className={btn.primary}>{t("send")}</button>
        <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
      </span>
    </form>
  );
}
