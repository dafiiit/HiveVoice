"use client";
import { usePathname, useRouter } from "next/navigation";
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
 * before, like tabs. The page follows the finger one to one; let go far enough (or with a quick flick) it slides out to that
 * side and the next section, loaded beforehand, slides in from the other. A short or mostly vertical move scrolls as always.
 * While the swipe is ours the browser does not move the page, so nothing else (the bar at the bottom) shifts with it.
 * `hrefs` in the order of the tabs, `active` the one open now (-1: none).
 */
function useSwipe(find: () => HTMLElement | null, hrefs: string[], active: number) {
  const router = useRouter();
  const path = usePathname();
  const now = useRef({ hrefs, active, find });
  useEffect(() => { now.current = { hrefs, active, find }; });
  // The direction of a swipe that is still arriving: the new section slides in from the other side.
  const arriving = useRef<0 | 1 | -1>(0);

  // The sections next door are loaded before anyone swipes, so the new one is there when the old one has slid out.
  const key = hrefs.join("|");
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    for (const i of [active - 1, active + 1]) if (i >= 0 && i < hrefs.length) router.prefetch(hrefs[i]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the list is compared by its addresses
  }, [key, active, router]);

  // The new section came (a new path, or in Freunde a new ?f=, so the open one changed): in from the side opposite to the swipe.
  useEffect(() => {
    const el = now.current.find();
    const dir = arriving.current;
    if (!el || !dir) return;
    arriving.current = 0;
    el.style.transition = "none";
    el.style.transform = `translate3d(${dir * -0.35 * window.innerWidth}px,0,0)`;
    el.style.opacity = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease-out";
      el.style.transform = "";
      el.style.opacity = "";
    }));
  }, [path, active]);

  useEffect(() => {
    const el = now.current.find();
    if (!el) return;
    const phone = window.matchMedia("(max-width: 767px)");
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, mode: "?" | "x" | "y" | "off" = "off";
    let target: Element | null = null;
    const settle = () => {
      el.style.transition = "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out";
      el.style.transform = "";
      el.style.opacity = "";
    };
    const start = (e: TouchEvent) => {
      if (!phone.matches || e.touches.length !== 1) { mode = "off"; return; }
      target = e.target as Element;
      if (target.closest(KEEP)) { mode = "off"; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = e.timeStamp; dx = 0; mode = "?";
    };
    const move = (e: TouchEvent) => {
      if (mode === "off" || mode === "y") return;
      const ddx = e.touches[0].clientX - x0, ddy = e.touches[0].clientY - y0;
      if (mode === "?") {
        if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
        // Mostly sideways, a section that way, and nothing that scrolls along: the swipe is ours.
        const { hrefs: h, active: a } = now.current;
        const next = ddx < 0 ? a + 1 : a - 1;
        mode = Math.abs(ddx) > Math.abs(ddy) * 1.2 && a >= 0 && next >= 0 && next < h.length && !scrollsAlong(target, ddx) ? "x" : "y";
        if (mode === "y") return;
        el.style.willChange = "transform";
      }
      // Ours: the browser must not scroll or move the page meanwhile.
      if (e.cancelable) e.preventDefault();
      dx = ddx;
      el.style.transition = "none";
      el.style.transform = `translate3d(${dx}px,0,0)`;
      el.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / window.innerWidth));
    };
    const end = (e: TouchEvent) => {
      if (mode !== "x") { mode = "off"; return; }
      mode = "off";
      el.style.willChange = "";
      const { hrefs: h, active: a } = now.current;
      const next = dx < 0 ? a + 1 : a - 1;
      const speed = Math.abs(dx) / Math.max(1, e.timeStamp - t0);
      if ((Math.abs(dx) > window.innerWidth * 0.3 || (speed > 0.5 && Math.abs(dx) > 40)) && next >= 0 && next < h.length) {
        // Out the side it was swiped to; the next section comes in from the other (above).
        const dir = dx < 0 ? 1 : -1;
        el.style.transition = "transform 160ms ease-in, opacity 160ms ease-in";
        el.style.transform = `translate3d(${-dir * window.innerWidth}px,0,0)`;
        el.style.opacity = "0";
        arriving.current = dir;
        router.push(h[next], { scroll: true });
        // Should the next section take long, the old one does not stay away.
        setTimeout(() => { if (arriving.current) { arriving.current = 0; settle(); } }, 2500);
      } else settle();
    };
    const cancel = () => { if (mode === "x") settle(); mode = "off"; el.style.willChange = ""; };
    el.addEventListener("touchstart", start, { passive: true });
    // Not passive: once the swipe is ours it stops the browser from moving the page.
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", cancel);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
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
