"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { slugify } from "@/lib/slug";
import { Carousel } from "./ui/Carousel";
import { chip, field } from "./ui/styles";

/**
 * Pick hashtags. Chosen tags sit on top and can be removed; ideas run in a
 * two-row carousel (swipe, scroll or use the arrows) so many more fit in little space.
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
  const add = (raw: string) => {
    const s = slugify(raw);
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
          <Carousel items={ideas} keyOf={(s) => s} rows={2} loop label={`${label} · ${t("ideas")}`}
            render={(s, hidden) => (
              <button type="button" tabIndex={hidden ? -1 : 0} disabled={value.length >= max} onClick={() => add(s)} className={`${chip(false)} whitespace-nowrap disabled:opacity-45`}>#{s}</button>
            )} />
        </div>
      )}
      <div className="flex max-w-[420px] gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={label}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); setDraft(""); } }} className={field.inputSm} />
        <button type="button" aria-label={t("add")} onClick={() => { add(draft); setDraft(""); }} className="h-11 flex-none border border-ink bg-transparent px-4 font-bold text-ink">+</button>
      </div>
    </fieldset>
  );
}
