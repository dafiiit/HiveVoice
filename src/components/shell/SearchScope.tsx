"use client";
import { useEffect } from "react";

/**
 * What the search at the top searches on this page. A page with a list declares it, and the one search
 * field in the header then says so ("Personen suchen") and searches only there:
 * - `filter`: hides the rows of the list `list` that do not fit while typing (rows carry `data-search`,
 *   `[data-search-none]` shows when nothing is left);
 * - `query`: Enter opens `action` with the words as `param`, keeping the other parameters in `keep`.
 * "Überall suchen" in the field's menu still reaches the search across everything.
 */
export type Scope = { what: string; value?: string } & (
  | { mode: "filter"; list: string }
  | { mode: "query"; action: string; param?: string; keep?: Record<string, string> }
);

let current: (Scope & { id: number }) | null = null;
let next = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const scopeStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => current,
  server: () => null,
};

/** Shows the rows of a list that contain the words. */
export function filterList(listId: string, q: string) {
  const list = document.getElementById(listId);
  if (!list) return;
  const needle = q.trim().toLowerCase();
  let shown = 0;
  list.querySelectorAll<HTMLElement>("[data-search]").forEach((row) => {
    const hit = !needle || (row.dataset.search ?? "").includes(needle);
    row.hidden = !hit;
    if (hit) shown++;
  });
  const empty = list.querySelector<HTMLElement>("[data-search-none]");
  if (empty) empty.hidden = shown > 0;
}

/** Renders nothing: sets the scope of the header search while the page is open. */
export function SearchScope(props: Scope) {
  const key = JSON.stringify(props);
  useEffect(() => {
    const own = { ...(JSON.parse(key) as Scope), id: ++next };
    current = own;
    emit();
    return () => { if (current?.id === own.id) { current = null; emit(); } };
  }, [key]);
  return null;
}
