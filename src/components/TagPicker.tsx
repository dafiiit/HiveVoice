"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { tagSlug } from "@/lib/slug";
import { chip, field } from "./ui/styles";

/**
 * Pick hashtags. Chosen tags sit on top and can be removed; ideas wrap in rows (never cut off),
 * twelve at first and the rest behind "Mehr Ideen".
 */
export function TagPicker({ label, value, onChange, suggestions, placeholder, max = 20 }: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  max?: number;
}) {
  const t = useTranslations("common.tags");
  const [draft, setDraft] = useState("");
  const [all, setAll] = useState(false);
  const add = (raw: string) => {
    const s = tagSlug(raw);
    if (s.length >= 2 && !value.includes(s) && value.length < max) onChange([...value, s]);
  };
  const remove = (s: string) => onChange(value.filter((x) => x !== s));
  const ideas = suggestions.filter((s) => !value.includes(s));

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-sm font-bold">{label}</legend>
      <div className="flex min-h-10 flex-wrap items-center gap-2" aria-live="polite">
        {value.length === 0 && <span className="text-sm text-muted">{t("none")}</span>}
        {value.map((s) => (
          <button key={s} type="button" onClick={() => remove(s)} aria-label={t("remove", { tag: `#${s}` })} className={`${chip(true)} gap-2`}>
            #{s} <span aria-hidden="true">✕</span>
          </button>
        ))}
      </div>
      {ideas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t("ideas")}</span>
          <div role="group" aria-label={`${label} · ${t("ideas")}`} className="flex flex-wrap gap-1.5">
            {(all ? ideas : ideas.slice(0, 12)).map((s) => (
              <button key={s} type="button" disabled={value.length >= max} onClick={() => add(s)} className={`${chip(false)} whitespace-nowrap disabled:opacity-45`}>#{s}</button>
            ))}
            {ideas.length > 12 && (
              <button type="button" onClick={() => setAll(!all)} className={`${chip(false)} bg-transparent underline`}>{all ? t("fewer") : t("more", { n: ideas.length - 12 })}</button>
            )}
          </div>
        </div>
      )}
      <div className="flex max-w-[420px] gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder ?? t("own")} aria-label={label}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); setDraft(""); } }} className={field.input} />
        <button type="button" aria-label={t("add")} onClick={() => { add(draft); setDraft(""); }} className="h-11 w-11 flex-none border border-ink bg-transparent font-bold text-ink">+</button>
      </div>
    </fieldset>
  );
}
