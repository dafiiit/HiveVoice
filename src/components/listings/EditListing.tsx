"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateListing } from "@/lib/actions/listings";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

/** Changing title and description: the owner, and whoever was given editing rights. */
export function EditListing({ id, title, description, path }: { id: string; title: string; description: string | null; path: string }) {
  const t = useTranslations("market.edit");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [ti, setTi] = useState(title);
  const [de, setDe] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>{t("button")}</button>;
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-3 border border-ink bg-surface p-4">
      <label className={field.label}>{t("title")}<input value={ti} maxLength={200} onChange={(e) => setTi(e.target.value)} className={field.input} /></label>
      <label className={field.label}>{t("description")}<textarea rows={5} value={de} onChange={(e) => setDe(e.target.value)} className={field.textarea} /></label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-3">
        <button type="button" disabled={pending || ti.trim().length < 3} className={btn.primary} onClick={() => start(async () => {
          const res = await updateListing(id, ti, de, path);
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          setOpen(false);
        })}>{t("save")}</button>
        <button type="button" onClick={() => setOpen(false)} className={btn.ghost}>{tc("cancel")}</button>
      </div>
    </div>
  );
}
