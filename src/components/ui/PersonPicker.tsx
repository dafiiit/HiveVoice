"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { searchPeople, type PeopleFilter, type PersonHit } from "@/lib/actions/people";
import { Avatar } from "./Avatar";
import { field } from "./styles";

/** Runs `fn` a moment after typing stops, once there are at least `min` characters; shorter input clears the hits. */
export function useDebouncedSearch<T>(q: string, fn: (q: string) => Promise<T[]>, { min = 3, delay = 300 } = {}) {
  const [hits, setHits] = useState<T[] | null>(null);
  const [seen, setSeen] = useState(q);
  // Too short: forget the old hits right away (no effect needed for that).
  if (q !== seen) { setSeen(q); if (q.trim().length < min) setHits(null); }
  useEffect(() => {
    if (q.trim().length < min) return;
    let live = true;
    const h = setTimeout(() => { fn(q).then((r) => { if (live) setHits(r); }); }, delay);
    return () => { live = false; clearTimeout(h); };
  }, [q, fn, min, delay]);
  return hits;
}

/**
 * Finding a person by name, the same everywhere (co-authors, invitations, access, hand-over, substitutes).
 * `action` renders what each hit offers (default: the whole row picks the person).
 */
export function PersonPicker({ filter = { kind: "any" }, label, placeholder, onPick, action, exclude = [], disabled }: {
  filter?: PeopleFilter; label: string; placeholder?: string; onPick?: (p: PersonHit) => void;
  action?: (p: PersonHit, clear: () => void) => ReactNode; exclude?: string[]; disabled?: boolean;
}) {
  const t = useTranslations("common");
  const [q, setQ] = useState("");
  const key = JSON.stringify(filter);
  const [search] = useState(() => (text: string) => searchPeople(text, JSON.parse(key) as PeopleFilter));
  const hits = useDebouncedSearch(q, search);
  const clear = () => setQ("");
  const shown = (hits ?? []).filter((h) => !exclude.includes(h.id));
  return (
    <div className="flex max-w-[520px] flex-col gap-1.5">
      <input type="search" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? t("searchPerson")} aria-label={label} className={field.input} />
      {hits && shown.length === 0 && <span className="text-sm text-muted">{t("nobodyFound")}</span>}
      {shown.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-b border-line py-1.5">
          <Avatar name={p.name} seed={p.seed} path={p.path} size={28} />
          {action ? (
            <>
              <span className="flex min-w-0 flex-1 flex-col"><strong className="truncate">{p.name}</strong>{p.headline && <span className="truncate text-xs text-muted">{p.headline}</span>}</span>
              {action(p, clear)}
            </>
          ) : (
            <button type="button" disabled={disabled} onClick={() => { onPick?.(p); clear(); }} className="flex min-w-0 flex-1 flex-col border-0 bg-transparent p-0 text-left text-ink">
              <strong className="truncate">{p.name}</strong>{p.headline && <span className="truncate text-xs text-muted">{p.headline}</span>}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
