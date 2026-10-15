"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const COPIES = 5;

/**
 * Horizontal carousel with an outlined arrow at each end. Swipe, scroll or click.
 * With loop the list repeats without an end in both directions. render() gets
 * hidden = true for the repeated copies, which must stay out of the tab order
 * and the accessibility tree.
 */
export function Carousel<T>({ items, render, label, rows = 1, loop = false, keyOf }: {
  items: T[];
  render: (item: T, hidden: boolean) => React.ReactNode;
  label: string;
  rows?: 1 | 2;
  loop?: boolean;
  keyOf: (item: T) => string;
}) {
  const t = useTranslations("common.tags");
  const track = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const copies = loop ? COPIES : 1;

  /** Width of one copy: where the first item of the second copy starts. */
  const period = useCallback(() => {
    const el = track.current;
    const a = el?.children[0] as HTMLElement | undefined;
    const b = el?.children[items.length] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : 0;
  }, [items.length]);

  const normalize = useCallback(() => {
    const el = track.current;
    const w = period();
    if (!el || !w) return;
    // Stay inside the middle copy; identical content makes the jump invisible.
    if (el.scrollLeft < w || el.scrollLeft >= 2 * w) el.scrollTo({ left: ((el.scrollLeft % w) + w) % w + 2 * w, behavior: "instant" });
  }, [period]);

  const measure = useCallback(() => {
    const el = track.current;
    if (el && !loop) setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, [loop]);

  useLayoutEffect(() => {
    const el = track.current;
    if (loop && el) { const w = period(); if (w) el.scrollTo({ left: 2 * w, behavior: "instant" }); }
  }, [loop, period]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const watch = new ResizeObserver(() => { measure(); if (loop) normalize(); });
    watch.observe(el);
    return () => { watch.disconnect(); if (idle.current) clearTimeout(idle.current); };
  }, [measure, normalize, loop]);

  const onScroll = () => {
    measure();
    if (!loop) return;
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(normalize, 120);
  };
  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });
  const arrow = "inline-flex w-10 flex-none items-center justify-center border border-line-strong bg-surface text-2xl leading-none text-ink disabled:opacity-35";

  return (
    <div className="flex items-stretch gap-1">
      <button type="button" onClick={() => page(-1)} disabled={!loop && edge.start} aria-label={t("prev")} className={arrow}><span aria-hidden="true">‹</span></button>
      <div ref={track} onScroll={onScroll} tabIndex={0} role="group" aria-label={label}
        className={`grid min-w-0 flex-1 auto-cols-max grid-flow-col gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${rows === 2 ? "grid-rows-2" : "grid-rows-1"}`}>
        {Array.from({ length: copies }, (_, c) => items.map((item) => (
          <Fragment key={`${c}-${keyOf(item)}`}>{render(item, c !== (loop ? 2 : 0))}</Fragment>
        )))}
      </div>
      <button type="button" onClick={() => page(1)} disabled={!loop && edge.end} aria-label={t("next")} className={arrow}><span aria-hidden="true">›</span></button>
    </div>
  );
}
