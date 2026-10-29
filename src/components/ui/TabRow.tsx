"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { TabItem } from "./Page";
import { tab } from "./styles";

/**
 * The tabs of a page in one row: as many as fit, whole, and the rest in "Mehr" at the end (never a tab cut in half behind it).
 * The open tab always stays in the row. Before the browser has measured (the first drawing) it shows `items` and puts `more` in the menu.
 */
export function TabRow({ label, items, more, moreLabel }: { label: string; items: TabItem[]; more: TabItem[]; moreLabel: string }) {
  const all = [...items, ...more];
  const row = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number | null>(null);
  const keys = all.map((it) => it.href).join("|");

  useLayoutEffect(() => {
    const el = row.current;
    const r = ruler.current;
    if (!el || !r) return;
    const measure = () => {
      const widths = [...r.children].map((c) => (c as HTMLElement).offsetWidth);
      const moreW = widths.pop() ?? 0; // the last one in the ruler is "Mehr"
      const room = el.clientWidth;
      let used = 0;
      let n = 0;
      for (; n < widths.length; n++) {
        const restAfter = n + 1 < widths.length ? moreW : 0;
        if (used + widths[n] + restAfter > room) break;
        used += widths[n];
      }
      setFit(n);
    };
    measure();
    // Again when the row changes size, and when the tabs themselves do (the font arrives after the first drawing).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(r);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [keys]);

  let shown: TabItem[];
  let rest: TabItem[];
  if (fit === null) {
    shown = [...items, ...more.filter((m) => m.on)];
    rest = more.filter((m) => !m.on);
  } else {
    shown = all.slice(0, Math.max(1, fit));
    rest = all.slice(shown.length);
    // The open tab is never hidden: it takes the place of the last one in the row.
    const open = rest.find((it) => it.on);
    if (open) {
      const out = shown.pop()!;
      shown.push(open);
      rest = [out, ...rest.filter((it) => it !== open)];
    }
  }

  return (
    <div ref={row} className="relative flex min-w-0 border-b border-line">
      {/* Every tab once, invisible, to know how wide it is. */}
      <div ref={ruler} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap">
        {all.map((it) => <span key={it.href} className={tab(it.on)}>{it.label}</span>)}
        <span className={`${tab(false)} gap-1.5`}>{moreLabel}<span className="text-xs">▾</span></span>
      </div>
      <div role="tablist" aria-label={label} className="flex min-w-0 overflow-hidden">
        {shown.map((it) => (
          <Link key={it.href} role="tab" aria-selected={it.on} href={it.href} scroll={false} className={`${tab(it.on)} flex-none`}>{it.label}</Link>
        ))}
      </div>
      {rest.length > 0 && (
        <details className="group relative flex-none">
          <summary className={`${tab(false)} cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden`}>
            {moreLabel}<span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="absolute right-0 z-20 mt-1 flex min-w-[200px] flex-col border border-ink bg-surface">
            {rest.map((it) => <Link key={it.href} href={it.href} className="flex h-11 items-center border-b border-line px-3 text-ink no-underline last:border-b-0 hover:bg-chip">{it.label}</Link>)}
          </div>
        </details>
      )}
    </div>
  );
}
