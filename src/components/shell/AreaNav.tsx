"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Swipe } from "./Swipe";

/**
 * `match`: the paths (and optionally one query value, "f=docs") that count as this section.
 * The first item is the default when nothing else matches.
 */
export type AreaItem = { href: string; label: string; badge?: number; match?: string[] };

/**
 * Phones: the sections of Gemeinschaft or Ich as a row of tabs under the top bar
 * (on wide screens the sidebar shows them).
 */
export function AreaFrame({ title, label, items, children }: { title: string; label: string; items: AreaItem[]; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {/* Phones only: on wide screens the sidebar lists the sections. */}
      <nav aria-label={label} className="flex-none border-line bg-surface md:hidden">
        {/* Not a heading: every page under it has its own h1. */}
        <p className="m-0 hidden px-5 pb-3 pt-6 text-[22px] font-bold leading-tight md:block">{title}</p>
        {/* The query part (?f=docs) is only known in the browser; the server marks the section by its path alone. */}
        <Suspense fallback={<Live items={items} params={null} />}><WithParams items={items} /></Suspense>
      </nav>
      {/* Phones: a swipe sideways goes to the next or previous section. No Suspense around the page: a boundary waiting
          for the address's query would keep everything below it from becoming interactive. The path is enough here. */}
      <SwipeSections items={items}>{children}</SwipeSections>
    </div>
  );
}

function WithParams({ items }: { items: AreaItem[] }) {
  return <Live items={items} params={useSearchParams()} />;
}

function SwipeSections({ items, children }: { items: AreaItem[]; children: ReactNode }) {
  const active = useActive(items, null);
  return <Swipe hrefs={items.map((it) => it.href)} active={active}>{children}</Swipe>;
}

function Live({ items, params }: { items: AreaItem[]; params: URLSearchParams | ReturnType<typeof useSearchParams> | null }) {
  return <List items={items} active={useActive(items, params)} />;
}

/** The section open now: the most specific match wins (a section with a query value before the plain one). */
function useActive(items: AreaItem[], params: URLSearchParams | ReturnType<typeof useSearchParams> | null) {
  const path = usePathname();
  const hit = (m: string) => {
    const [p, q] = m.split("?");
    const pathOk = p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : path === p;
    if (!pathOk) return false;
    if (!q) return true;
    const [k, v] = q.split("=");
    return (params?.get(k) ?? "") === v;
  };
  const scored = items.map((it, i) => ({ i, score: Math.max(-1, ...(it.match ?? [it.href]).map((m) => (hit(m) ? m.length : -1))) }));
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a), { i: -1, score: -1 });
  return best.score >= 0 ? best.i : -1;
}

function List({ items, active }: { items: AreaItem[]; active: number }) {
  return (
    <div className="scroll-hint flex overflow-x-auto border-b border-line md:flex-col md:border-b-0 md:pb-6">
      {items.map((it, i) => {
        const on = i === active;
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
            className={`flex h-11 flex-none items-center gap-2 whitespace-nowrap px-4 text-ink no-underline max-md:border-b-4 md:h-11 md:border-l-4 md:px-5 ${on ? "border-ink font-bold md:bg-paper" : "border-transparent"}`}>
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ink px-1 text-xs font-bold text-on-ink">{it.badge}</span>}
          </Link>
        );
      })}
    </div>
  );
}
