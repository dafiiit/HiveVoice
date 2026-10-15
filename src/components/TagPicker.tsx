"use client";
import { useState } from "react";
import { slugify } from "@/lib/slug";
import { chip, field } from "./ui/styles";

/** Pick hashtags from suggestions or add your own. */
export function TagPicker({ label, value, onChange, suggestions, placeholder, max = 20 }: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : value.length < max ? [...value, s] : value);
  const add = () => {
    const s = slugify(draft);
    if (s.length >= 2 && !value.includes(s) && value.length < max) onChange([...value, s]);
    setDraft("");
  };
  const all = Array.from(new Set([...value, ...suggestions]));
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-3 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {all.map((s) => (
          <button key={s} type="button" aria-pressed={value.includes(s)} onClick={() => toggle(s)} className={chip(value.includes(s))}>#{s}</button>
        ))}
      </div>
      <div className="flex max-w-[420px] gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={label}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className={field.inputSm} />
        <button type="button" onClick={add} className="h-11 flex-none border border-ink bg-transparent px-4 font-bold text-ink">+</button>
      </div>
    </fieldset>
  );
}
