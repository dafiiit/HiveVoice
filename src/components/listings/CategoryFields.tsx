"use client";
import { useTranslations } from "next-intl";
import { CATEGORIES, CATEGORY_DEFS, type Category, type CustomField } from "@/lib/market";
import { Glyph } from "../ui/Glyph";
import { btn, chip, field } from "../ui/styles";

/** The kind of entry: each one opens its own fields (job, flat, thing, ride ...). */
export function CategoryPicker({ value, onChange, guess }: { value: Category; onChange: (c: Category) => void; guess?: Category | null }) {
  const t = useTranslations("categories");
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">{t("label")}</span>
      <div role="radiogroup" aria-label={t("label")} className="grid grid-cols-1 gap-2 @sm:grid-cols-2 @2xl:grid-cols-3">
        {CATEGORIES.map((c) => {
          const on = value === c;
          return (
            <button key={c} type="button" role="radio" aria-checked={on} onClick={() => onChange(c)}
              className={`flex min-h-[64px] items-start gap-2 p-2.5 text-left text-sm ${on ? "bg-ink text-on-ink" : "border border-line bg-surface text-ink"}`}>
              <span className="flex-none pt-0.5"><Glyph shape={CATEGORY_DEFS[c].glyph} size={20} color={on ? "var(--on-ink)" : "var(--ink)"} /></span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="leading-tight">{t(`names.${c}`)}</strong>
                <span className={`hyphens-auto text-[12px] leading-snug [overflow-wrap:anywhere] ${on ? "" : "text-muted"}`}>{t(`hints.${c}`)}</span>
                {guess === c && !on && <span className="text-[12px] font-bold text-red">{t("guess")}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Values = Record<string, unknown>;

/** The fields of one category. Values stay strings or booleans until the server cleans them. */
export function AttrFields({ category, value, onChange }: { category: Category; value: Values; onChange: (v: Values) => void }) {
  const t = useTranslations("categories");
  const defs = CATEGORY_DEFS[category].fields;
  if (category === "custom") return <CustomFields value={(value.fields as CustomField[]) ?? []} onChange={(fields) => onChange({ ...value, fields })} />;
  if (!defs.length) return null;
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
      {defs.map((f) => {
        const label = t(`${category}.${f.key}`);
        const v = value[f.key];
        if (f.type === "select") {
          return (
            <div key={f.key} className="flex flex-col gap-1.5 sm:col-span-2" role="radiogroup" aria-label={label}>
              <span className="text-sm font-bold">{label}</span>
              <div className="flex flex-wrap gap-1.5">
                {f.options.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(f.key, v === o ? "" : o)} className={`${chip(v === o)} h-9 px-3`}>
                    {t(`${category}.${f.key}Options.${o}`)}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (f.type === "bool") {
          return (
            <label key={f.key} className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" checked={v === true} onChange={() => set(f.key, v !== true)} className="h-6 w-6 accent-[var(--ink)]" />{label}
            </label>
          );
        }
        const type = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text";
        return (
          <label key={f.key} className={field.label}>{label}{f.type === "number" && f.unit === "m2" ? " (m²)" : ""}
            <input type={type} value={String(v ?? "")} min={f.type === "number" ? f.min : undefined} max={f.type === "number" ? f.max : undefined}
              maxLength={80} onChange={(e) => set(f.key, e.target.value)} className={field.input} />
          </label>
        );
      })}
    </div>
  );
}

/** A form the person defines: up to eight fields with a name and a content. */
function CustomFields({ value, onChange }: { value: CustomField[]; onChange: (v: CustomField[]) => void }) {
  const t = useTranslations("categories.custom");
  const rows = value.length ? value : [{ label: "", value: "" }];
  const set = (i: number, patch: Partial<CustomField>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">{t("lead")}</span>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-end gap-2">
          <label className={field.label}>{t("label")}<input value={r.label} maxLength={80} placeholder={t("labelPlaceholder")} onChange={(e) => set(i, { label: e.target.value })} className={field.input} /></label>
          <label className={field.label}>{t("value")}<input value={r.value} maxLength={200} placeholder={t("valuePlaceholder")} onChange={(e) => set(i, { value: e.target.value })} className={field.input} /></label>
          <button type="button" aria-label={t("remove")} onClick={() => onChange(rows.filter((_, j) => j !== i))} className="h-11 w-9 border-0 bg-transparent text-muted">✕</button>
        </div>
      ))}
      {rows.length < 8 && <button type="button" onClick={() => onChange([...rows, { label: "", value: "" }])} className={`${btn.link} self-start text-sm font-bold`}>+ {t("add")}</button>}
    </div>
  );
}
