"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { slugify } from "@/lib/slug";
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
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const add = (raw: string) => {
    const s = slugify(raw);
    if (s.length >= 2 && !value.includes(s) && value.length < max) onChange([...value, s]);
  };
  const remove = (s: string) => onChange(value.filter((x) => x !== s));
  const ideas = suggestions.filter((s) => !value.includes(s));

  const measure = () => {
    const el = track.current;
    if (el) setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ideas.length]);
  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });

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
          <div className="relative flex items-stretch gap-1">
            <button type="button" onClick={() => page(-1)} disabled={edge.start} aria-label={t("prev")}
              className="inline-flex w-10 flex-none items-center justify-center border border-line-strong bg-surface text-2xl leading-none text-ink disabled:opacity-35"><span aria-hidden="true">‹</span></button>
            <div ref={track} onScroll={measure} tabIndex={0} role="group" aria-label={`${label} · ${t("ideas")}`}
              className="grid min-w-0 flex-1 snap-x auto-cols-max grid-flow-col grid-rows-2 gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ideas.map((s) => (
                <button key={s} type="button" disabled={value.length >= max} onClick={() => add(s)} className={`${chip(false)} snap-start whitespace-nowrap disabled:opacity-45`}>#{s}</button>
              ))}
            </div>
            <button type="button" onClick={() => page(1)} disabled={edge.end} aria-label={t("next")}
              className="inline-flex w-10 flex-none items-center justify-center border border-line-strong bg-surface text-2xl leading-none text-ink disabled:opacity-35"><span aria-hidden="true">›</span></button>
          </div>
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
