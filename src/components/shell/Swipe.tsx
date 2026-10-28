"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// Where a swipe must not change the page: typing, the note editor, maps, drawings, and whatever says so itself.
const KEEP = "input, textarea, select, [contenteditable=true], .cm-editor, .maplibregl-map, canvas, iframe, [role=dialog], [data-no-swipe]";

/** Inside a box that can still scroll sideways in the direction of the swipe (a row of tabs, a table): that box gets it. */
function scrollsAlong(start: Element | null, dx: number) {
  for (let e = start; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (!/(auto|scroll)/.test(s.overflowX) || e.scrollWidth <= e.clientWidth + 1) continue;
    if (dx < 0 && e.scrollLeft + e.clientWidth < e.scrollWidth - 1) return true;
    if (dx > 0 && e.scrollLeft > 0) return true;
  }
  return false;
}

/**
 * Phones: a swipe to the left opens the next section of the area (Überblick → Anliegen → Kalender …), to the right the one
 * before, like tabs. The page follows the finger a little, so one sees what is about to happen; a short or mostly vertical
 * move scrolls as always. `hrefs` in the order of the tabs, `active` the one open now (-1: none).
 */
function useSwipe(find: () => HTMLElement | null, hrefs: string[], active: number) {
  const router = useRouter();
  const now = useRef({ hrefs, active, find });
  useEffect(() => { now.current = { hrefs, active, find }; });

  useEffect(() => {
    const el = now.current.find();
    if (!el) return;
    const phone = window.matchMedia("(max-width: 767px)");
    let x0 = 0, y0 = 0, dx = 0, mode: "?" | "x" | "y" | "off" = "off";
    let target: Element | null = null;
    const reset = (animate: boolean) => {
      el.style.transition = animate ? "transform 180ms ease-out, opacity 180ms ease-out" : "";
      el.style.transform = "";
      el.style.opacity = "";
    };
    const start = (e: TouchEvent) => {
      if (!phone.matches || e.touches.length !== 1) { mode = "off"; return; }
      target = e.target as Element;
      if (target.closest(KEEP)) { mode = "off"; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = "?";
    };
    const move = (e: TouchEvent) => {
      if (mode === "off" || mode === "y") return;
      const ddx = e.touches[0].clientX - x0, ddy = e.touches[0].clientY - y0;
      if (mode === "?") {
        if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
        // Mostly sideways, a section that way, and nothing that scrolls along: the swipe is ours.
        const { hrefs: h, active: a } = now.current;
        const next = ddx < 0 ? a + 1 : a - 1;
        mode = Math.abs(ddx) > Math.abs(ddy) * 1.5 && a >= 0 && next >= 0 && next < h.length && !scrollsAlong(target, ddx) ? "x" : "y";
        if (mode === "y") return;
      }
      dx = ddx;
      el.style.transition = "";
      el.style.transform = `translateX(${dx * 0.35}px)`;
      el.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / 900));
    };
    const end = () => {
      if (mode !== "x") { mode = "off"; return; }
      mode = "off";
      const { hrefs: h, active: a } = now.current;
      const next = dx < 0 ? a + 1 : a - 1;
      if (Math.abs(dx) > Math.min(110, window.innerWidth * 0.28) && next >= 0 && next < h.length) {
        // Out the side it was swiped to, then the next section.
        el.style.transition = "transform 140ms ease-in, opacity 140ms ease-in";
        el.style.transform = `translateX(${dx < 0 ? -60 : 60}px)`;
        el.style.opacity = "0.4";
        router.push(h[next]);
        setTimeout(() => reset(false), 400);
      } else reset(true);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", () => { mode = "off"; reset(true); });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
    };
  }, [router]);
}

export function Swipe({ hrefs, active, children }: { hrefs: string[]; active: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useSwipe(() => box.current, hrefs, active);
  // No lasting transform (it would make the bottom sheets of menus inside position themselves to this box, not the screen).
  return <div ref={box} className="min-w-0 flex-1">{children}</div>;
}

/** The same, for an element that is already there (found by its id), without a box around it. */
export function SwipeOn({ id, hrefs, active }: { id: string; hrefs: string[]; active: number }) {
  useSwipe(() => document.getElementById(id), hrefs, active);
  return null;
}
