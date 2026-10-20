"use client";
import { useEffect, useRef } from "react";
import { IconSearch } from "../ui/Icons";

/**
 * Search field above the conversation list. Filters the rows while typing
 * (rows carry `data-search`, `data-search-none` shows when nothing is left);
 * without JavaScript it is a GET form with `s`.
 */
export function ListSearch({ listId, value, keep, label }: { listId: string; value: string; keep: Record<string, string>; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const filter = (q: string) => {
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
  };
  useEffect(() => { if (input.current?.value) filter(input.current.value); });
  return (
    <form method="get" action="/connect" role="search" className="flex min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-line-strong bg-surface px-2.5 text-muted focus-within:border-ink">
        <IconSearch size={16} />
        <span className="sr-only">{label}</span>
        <input ref={input} type="search" name="s" defaultValue={value} placeholder={`${label} …`} autoComplete="off" enterKeyHint="search"
          onInput={(e) => filter(e.currentTarget.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink outline-none placeholder:text-muted md:text-sm" />
      </label>
    </form>
  );
}
