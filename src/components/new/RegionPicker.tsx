"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { searchPlaces, type Place } from "@/app/onboarding/actions";
import { chip, field } from "../ui/styles";

/** Choose a level from the person's own region chain, or search any place. */
export function RegionPicker({ chain, value, onChange }: { chain: { id: string; name: string; level: string }[]; value: { id: string; name: string; level: string } | null; onChange: (r: { id: string; name: string; level: string }) => void }) {
  const t = useTranslations("new.region");
  const tl = useTranslations("levels");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  useEffect(() => {
    const h = setTimeout(() => { if (q.trim().length >= 2) searchPlaces(q).then(setHits); else setHits([]); }, 250);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t("level")} className="flex flex-wrap gap-2">
        {chain.map((r) => (
          <button key={r.id} type="button" role="radio" aria-checked={value?.id === r.id} onClick={() => onChange(r)} className={chip(value?.id === r.id)}>
            {r.name} · {tl(r.level as "all")}
          </button>
        ))}
      </div>
      <label className={field.label}>{t("other")}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeholder")} className={field.input} />
      </label>
      {hits.map((h) => (
        <button key={h.id} type="button" onClick={() => { onChange({ id: h.id, name: h.name, level: h.level }); setQ(""); setHits([]); }}
          className="flex justify-between border-0 border-b border-line bg-transparent py-2 text-left text-ink">
          <strong>{h.name}</strong><span className="text-sm text-muted">{tl(h.level as "all")}{h.context ? ` · ${h.context}` : ""}</span>
        </button>
      ))}
    </div>
  );
}
