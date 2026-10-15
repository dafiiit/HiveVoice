"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { quickSearch, type Hit } from "@/lib/actions/search";
import { IconSearch } from "../ui/Icons";

const ORDER = ["initiative", "group", "person", "link", "responsible", "place"] as const;
const TAB: Record<string, string> = { initiative: "initiatives", group: "groups", person: "people", responsible: "responsible", link: "links" };

/**
 * Search at the top. While typing it offers a few direct hits per kind (initiatives, groups,
 * people, responsible bodies, places). Enter without choosing opens the full search in Entdecken,
 * on the tab that has the most hits.
 */
export function QuickSearch({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<SearchBox initial="" className={className} />}>
      <SearchWithUrl className={className} />
    </Suspense>
  );
}

/** On the results page the box shows what was searched; elsewhere it starts empty. */
function SearchWithUrl({ className }: { className: string }) {
  const params = useSearchParams();
  const onResults = usePathname().startsWith("/explore");
  const urlQuery = onResults ? params.get("q") ?? "" : "";
  return <SearchBox key={urlQuery} initial={urlQuery} className={className} />;
}

const wideQuery = "(min-width: 640px)";
const watchWide = (cb: () => void) => { const m = window.matchMedia(wideQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

function SearchBox({ initial, className }: { initial: string; className: string }) {
  const t = useTranslations("nav");
  const wide = useSyncExternalStore(watchWide, () => window.matchMedia(wideQuery).matches, () => true);
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[]>([]);
  const [settled, setSettled] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLFormElement>(null);
  const list = useId();
  const query = q.trim();
  const ready = settled === query && query.length >= 2;
  const rows = ready ? ORDER.flatMap((k) => hits.filter((h) => h.kind === k)) : [];
  const total = rows.length + (ready ? 1 : 0);

  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    const h = setTimeout(() => quickSearch(query).then((res) => { if (live) { setHits(res); setSettled(query); setActive(-1); } }), 200);
    return () => { live = false; clearTimeout(h); };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  const full = () => {
    const best = (["initiative", "group", "person", "responsible", "link"] as const)
      .map((k) => [k, hits.filter((h) => h.kind === k).length] as const).sort((a, b) => b[1] - a[1])[0];
    const kind = ready && best && best[1] > 0 ? TAB[best[0]] : "initiatives";
    go(`/explore?q=${encodeURIComponent(query)}${kind !== "initiatives" ? `&kind=${kind}` : ""}`);
  };
  const choose = (i: number) => (i < rows.length ? go(rows[i].href) : full());

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" && total) { e.preventDefault(); setOpen(true); setActive((active + 1) % total); }
    else if (e.key === "ArrowUp" && total) { e.preventDefault(); setActive((active - 1 + total) % total); }
    else if (e.key === "Enter" && active >= 0 && open) { e.preventDefault(); choose(active); }
  };

  const shown = open && query.length >= 2;
  return (
    <form ref={root} action="/explore" role="search" onSubmit={(e) => { e.preventDefault(); if (query) full(); }} className={`relative min-w-0 flex-1 md:max-w-[560px] ${className}`}>
      <div className="flex h-11 items-center gap-2.5 border border-line-strong bg-surface px-3.5 focus-within:border-ink">
        <IconSearch />
        <label className="sr-only" htmlFor={`${list}-q`}>{t("search")}</label>
        <input id={`${list}-q`} name="q" type="search" value={q} autoComplete="off" placeholder={wide ? t("searchPlaceholder") : t("searchPlaceholderShort")}
          role="combobox" aria-expanded={shown} aria-controls={list} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${list}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none" />
      </div>
      {shown && (
        <ul id={list} role="listbox" aria-label={t("search")} className="absolute left-0 right-0 top-full z-40 m-0 mt-1 flex max-h-[70dvh] list-none flex-col overflow-y-auto border border-ink bg-surface p-0">
          {!ready && <li role="presentation" className="px-3.5 py-3 text-sm text-muted">{t("searchBusy")}</li>}
          {ready && rows.length === 0 && <li role="presentation" className="px-3.5 py-3 text-sm text-muted">{t("searchNone")}</li>}
          {rows.map((h, i) => {
            const heading = i === 0 || rows[i - 1].kind !== h.kind;
            return (
              <li key={`${h.kind}-${h.id}`} role="presentation">
                {heading && <div role="presentation" className="px-3.5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted">{t(`searchKinds.${h.kind}`)}</div>}
                <button type="button" id={`${list}-${i}`} role="option" aria-selected={active === i} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
                  className={`flex w-full flex-col items-start gap-0 border-0 px-3.5 py-2 text-left text-ink ${active === i ? "bg-chip" : "bg-transparent"}`}>
                  <strong className="max-w-full truncate">{h.title}</strong>
                  {h.sub && <span className="max-w-full truncate text-xs text-muted">{h.sub}</span>}
                </button>
              </li>
            );
          })}
          {ready && (
            <li role="presentation" className="border-t border-line">
              <button type="button" id={`${list}-${rows.length}`} role="option" aria-selected={active === rows.length} onMouseEnter={() => setActive(rows.length)} onClick={() => full()}
                className={`flex w-full items-center gap-2 border-0 px-3.5 py-3 text-left font-bold text-ink ${active === rows.length ? "bg-chip" : "bg-transparent"}`}>
                <IconSearch size={14} /> {t("searchAll", { q: query })}
              </button>
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
