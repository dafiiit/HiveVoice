"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { quickSearch, type Hit } from "@/lib/actions/search";
import { IconSearch } from "../ui/Icons";
import { searchBox, searchInput } from "../ui/styles";
import { filterList, scopeStore, type Scope } from "./SearchScope";

const ORDER = ["initiative", "group", "person", "link", "responsible", "place"] as const;
// Where "all results" open: Gemeinschaft → Gruppen (with Initiativen) or → Personen (responsible people are people with a tag).
const FULL: Record<string, (q: string) => string> = {
  initiative: (q) => `/community/groups?kind=initiatives&q=${q}`,
  group: (q) => `/community/groups?q=${q}`,
  person: (q) => `/community/people?q=${q}`,
  responsible: (q) => `/community/people?q=${encodeURIComponent("zuständig ")}${q}`,
  link: (q) => `/community/groups?q=${q}`,
};

/**
 * Search at the top, the only search field of the app. On a page that declares a scope (`SearchScope`)
 * it searches that list ("Personen suchen"), with "Überall suchen" in its menu for everything else.
 * Elsewhere it offers a few direct hits per kind (initiatives, groups, people, responsible bodies, places)
 * while typing; Enter without choosing opens the full search in Entdecken, on the tab that has the most hits.
 */
export function QuickSearch({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<SearchBox initial="" className={className} />}>
      <SearchWithUrl className={className} />
    </Suspense>
  );
}

/** On the results page the box shows what was searched; with a scope it shows the scope's words; elsewhere it starts empty. */
function SearchWithUrl({ className }: { className: string }) {
  const params = useSearchParams();
  const scope = useSyncExternalStore(scopeStore.subscribe, scopeStore.get, scopeStore.server);
  const onResults = usePathname().startsWith("/community/");
  const urlQuery = onResults ? params.get("q") ?? "" : "";
  return <SearchBox initial={scope ? scope.value ?? "" : urlQuery} scope={scope} className={className} />;
}

const wideQuery = "(min-width: 640px)";
const watchWide = (cb: () => void) => { const m = window.matchMedia(wideQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

function SearchBox({ initial, scope = null, className }: { initial: string; scope?: (Scope & { id: number }) | null; className: string }) {
  const t = useTranslations("nav");
  const wide = useSyncExternalStore(watchWide, () => window.matchMedia(wideQuery).matches, () => true);
  const router = useRouter();
  const [q, setQ] = useState(initial);
  // "Überall suchen" leaves the page's scope until the next page (or Escape).
  const [everywhere, setEverywhere] = useState(false);
  // A new page (or its scope) brings its own words; what was typed while the page was still loading stays.
  const [seen, setSeen] = useState({ initial, scope: scope?.id ?? 0 });
  const [typed, setTyped] = useState(false);
  if (seen.initial !== initial || seen.scope !== (scope?.id ?? 0)) {
    const arriving = seen.scope === 0 && !!scope && typed;
    setSeen({ initial, scope: scope?.id ?? 0 });
    setEverywhere(false);
    if (!arriving) { setQ(initial); setTyped(false); }
  }
  const [hits, setHits] = useState<Hit[]>([]);
  const [settled, setSettled] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const local = everywhere ? null : scope;
  const root = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useId();
  const query = q.trim();
  const ready = !local && settled === query && query.length >= 2;
  const rows = ready ? ORDER.flatMap((k) => hits.filter((h) => h.kind === k)) : [];
  const total = local ? (query ? 1 : 0) : rows.length + (ready ? 1 : 0);

  // A list opened with words (from the address, or typed before it was ready) starts filtered.
  useEffect(() => { if (local?.mode === "filter" && q) filterList(local.list, q); }, [local]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (local || query.length < 2) return;
    let live = true;
    const h = setTimeout(() => quickSearch(query).then((res) => { if (live) { setHits(res); setSettled(query); setActive(-1); } }), 200);
    return () => { live = false; clearTimeout(h); };
  }, [query, local]);

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
    go(FULL[ready && best && best[1] > 0 ? best[0] : "group"](encodeURIComponent(query)));
  };
  const leave = () => {
    if (scope?.mode === "filter") filterList(scope.list, "");
    setEverywhere(true); setOpen(true); setActive(-1); input.current?.focus();
  };
  const inScope = () => {
    if (!local) return;
    if (local.mode === "filter") { setOpen(false); input.current?.blur(); return; }
    const p = new URLSearchParams(local.keep ?? {});
    if (query) p.set(local.param ?? "q", query);
    setOpen(false);
    router.push(`${local.action}${p.size ? `?${p}` : ""}`);
  };
  const choose = (i: number) => (local ? leave() : i < rows.length ? go(rows[i].href) : full());

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); if (everywhere && scope) { setEverywhere(false); if (scope.mode === "filter") filterList(scope.list, q); } return; }
    if (e.key === "ArrowDown" && total) { e.preventDefault(); setOpen(true); setActive((active + 1) % total); }
    else if (e.key === "ArrowUp" && total) { e.preventDefault(); setActive((active - 1 + total) % total); }
    else if (e.key === "Enter" && active >= 0 && open) { e.preventDefault(); choose(active); }
  };

  const shown = open && query.length >= (local ? 1 : 2);
  const label = local ? t("searchScoped", { what: local.what }) : t("search");
  const remote = local?.mode === "query" ? local : null;
  return (
    <form ref={root} action={remote ? remote.action : "/community/groups"} role="search" onSubmit={(e) => { e.preventDefault(); if (local) inScope(); else if (query) full(); }} className={`relative min-w-0 flex-1 md:max-w-[560px] ${className}`}>
      {remote && Object.entries(remote.keep ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className={searchBox("md")}>
        <IconSearch />
        <label className="sr-only" htmlFor={`${list}-q`}>{label}</label>
        <input ref={input} id={`${list}-q`} name={remote?.param ?? "q"} type="search" value={q} autoComplete="off" enterKeyHint="search"
          placeholder={local ? `${label} …` : wide ? t("searchPlaceholder") : t("searchPlaceholderShort")}
          role="combobox" aria-expanded={shown} aria-controls={list} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${list}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setTyped(true); setOpen(true); if (local?.mode === "filter") filterList(local.list, e.target.value); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          className={searchInput} />
      </div>
      {shown && local && (
        // In a scope the list itself shows the hits; the menu only offers the way out.
        <ul id={list} role="listbox" aria-label={t("search")} className="absolute left-0 right-0 top-full z-40 m-0 mt-1 flex list-none flex-col border border-ink bg-surface p-0">
          <li role="presentation">
            <button type="button" id={`${list}-0`} role="option" aria-selected={active === 0} onMouseEnter={() => setActive(0)} onClick={leave}
              className={`flex h-11 w-full items-center gap-2 border-0 px-3.5 text-left text-ink ${active === 0 ? "bg-chip" : "bg-transparent"}`}>
              <IconSearch size={14} /> <span className="truncate">{t("searchEverywhere", { q: query })}</span>
            </button>
          </li>
        </ul>
      )}
      {shown && !local && (
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
