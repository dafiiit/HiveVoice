"use client";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { searchPlaces, type Place } from "@/app/onboarding/actions";
import { field } from "./ui/styles";

/**
 * A place field that understands postal codes: type 80336 or "Sendling" and the
 * matching place can be picked, so the entry is found in the right region.
 * Free text (a street, "Westpark") stays possible and keeps the region unchanged.
 */
export function PlaceInput({ label, value, onChange, onPlace, hint }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onPlace: (place: Place | null) => void;
  hint?: string;
}) {
  const t = useTranslations("market.editor");
  const tl = useTranslations("levels");
  const [hits, setHits] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [typing, setTyping] = useState(false);
  const list = useId();
  const query = value.trim();
  const shown = typing && query.length >= 2 ? hits : [];

  useEffect(() => {
    if (!typing || query.length < 2) return;
    let live = true;
    const h = setTimeout(() => {
      searchPlaces(query).then((res) => {
        if (!live) return;
        setHits(res);
        // A full postal code with a single match needs no further click.
        if (/^\d{5}$/.test(query) && res.length === 1) choose(res[0], query);
      });
    }, 250);
    return () => { live = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, typing]);

  function choose(p: Place, code?: string) {
    setPicked(p);
    setTyping(false);
    onChange(code ? `${code} ${p.name}` : p.name);
    onPlace(p);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5 text-sm font-bold">{label}
        <input value={value} onChange={(e) => { onChange(e.target.value); setTyping(true); setPicked(null); onPlace(null); }}
          placeholder={hint} autoComplete="off" role="combobox" aria-expanded={shown.length > 0} aria-controls={list} className={field.inputSm} />
      </label>
      {shown.length > 0 && (
        <ul id={list} role="listbox" className="absolute left-0 right-0 top-full z-20 m-0 mt-1 flex max-h-[260px] list-none flex-col overflow-y-auto border border-ink bg-surface p-0">
          {shown.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => choose(h, /^\d{5}$/.test(query) ? query : undefined)}
                className="flex w-full flex-col items-start gap-0.5 border-0 border-b border-line bg-transparent px-3 py-2 text-left text-ink">
                <strong>{h.name}{h.locality && h.locality !== h.name ? ` · ${h.locality}` : ""}</strong>
                <span className="text-xs text-muted">{tl(h.level as "municipality")}{h.context ? ` · ${h.context}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && <span className="text-xs font-normal text-muted">{t("placeFound", { name: picked.name, level: tl(picked.level as "municipality") })}</span>}
    </div>
  );
}
