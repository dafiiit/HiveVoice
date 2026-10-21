"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const ACTIVE = '[aria-current="page"], [aria-current="true"], [aria-selected="true"], [aria-pressed="true"]';

/**
 * Rows that scroll sideways (tabs, chips, place levels) show their active item: after every navigation each
 * such row is scrolled so the active one sits in view, centred where possible. One place for the whole app.
 */
export function ActiveInView() {
  const path = usePathname();
  const query = useSearchParams();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>(ACTIVE).forEach((el) => {
        let row = el.parentElement;
        while (row && row !== document.body && !(row.scrollWidth > row.clientWidth + 1 && getComputedStyle(row).overflowX !== "visible")) row = row.parentElement;
        if (!row || row === document.body) return;
        const r = row.getBoundingClientRect(), e = el.getBoundingClientRect();
        if (e.left >= r.left && e.right <= r.right) return;
        row.scrollLeft += e.left - r.left - (r.width - e.width) / 2;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [path, query]);
  return null;
}
