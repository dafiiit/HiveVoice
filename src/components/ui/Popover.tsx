"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The one dropdown of the app (filters, sorting, language, place). A native details element, so it opens
 * without JavaScript too; with JavaScript it closes on a click outside, on Escape and when a link inside is chosen.
 * On phones the panel is a sheet from the bottom edge (the button stays visible above it), scrolling inside if needed.
 * Only one menu is open at a time: opening one closes the others.
 * On wider screens the panel floats above everything (fixed position under its button), so a list column that scrolls
 * or a map next to it never cuts it off.
 * `size`: "sm" (36 px) next to other tool bar controls, "md" (44 px) in the top bar.
 * `open` / `onOpenChange` make it controlled (for menus that close themselves after an action).
 * `icon`: the button is a square with only an icon (and no arrow); `ariaLabel` then names it, also as its tooltip.
 * `primary`: black like the main button of a page (a "+ Neu" that opens a choice).
 */
export function Popover({ label, badge, align = "left", size = "sm", ariaLabel, icon = false, primary = false, open, onOpenChange, panelClassName, className = "", children }: {
  label: ReactNode; badge?: number; align?: "left" | "right"; size?: "sm" | "md"; ariaLabel?: string; icon?: boolean; primary?: boolean;
  open?: boolean; onOpenChange?: (open: boolean) => void; panelClassName?: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && open !== undefined && d.open !== open) d.open = open;
  }, [open]);
  useEffect(() => {
    const close = () => { const d = ref.current; if (d?.open) { d.open = false; onOpenChange?.(false); } };
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onOpenChange]);
  return (
    <details ref={ref} className={`group relative ${className}`} onToggle={(e) => { onOpenChange?.(e.currentTarget.open); if (e.currentTarget.open) { closeOthers(e.currentTarget); float(e.currentTarget, panel.current, align); } }}>
      <summary role="button" aria-label={ariaLabel} title={icon ? ariaLabel : undefined}
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 border text-sm font-bold [&::-webkit-details-marker]:hidden ${primary ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface text-ink"} ${size === "md" ? "h-11" : "h-9"} ${icon ? `justify-center px-0 group-open:bg-ink group-open:text-on-ink ${size === "md" ? "w-11" : "w-9"}` : "px-3"}`}>
        {label}
        {!!badge && <span className="inline-flex h-4 min-w-4 items-center justify-center bg-ink px-1 text-[11px] font-bold text-on-ink">{badge}</span>}
        {!icon && <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▾</span>}
      </summary>
      <div ref={panel} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) { e.currentTarget.closest("details")?.removeAttribute("open"); onOpenChange?.(false); } }}
        className={panelClassName ?? `absolute z-40 mt-1 flex w-[min(320px,calc(100vw-3rem))] flex-col gap-3 border border-ink bg-surface p-3 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-sm:top-auto max-sm:z-[70] max-sm:mt-0 max-sm:max-h-[65dvh] max-sm:w-auto max-sm:overflow-y-auto max-sm:border-x-0 max-sm:border-b-0 max-sm:p-4 ${align === "right" ? "right-0" : "left-0"}`}>
        {children}
      </div>
    </details>
  );
}

/**
 * Wide screens: pins the open panel to the screen right under its button (escaping columns that scroll or clip),
 * keeps it there while the page scrolls and inside the window. Phones keep the sheet from the CSS.
 */
function float(details: HTMLDetailsElement, el: HTMLDivElement | null, align: "left" | "right") {
  if (!el || !window.matchMedia("(min-width: 640px)").matches) return;
  const summary = details.querySelector("summary");
  if (!summary) return;
  const place = () => {
    if (!details.open) return stop();
    const b = summary.getBoundingClientRect();
    const w = el.offsetWidth;
    const left = align === "right" ? b.right - w : b.left;
    el.style.position = "fixed";
    el.style.top = `${Math.round(b.bottom + 4)}px`;
    el.style.left = `${Math.round(Math.min(Math.max(12, left), window.innerWidth - w - 12))}px`;
    el.style.right = "auto";
    el.style.zIndex = "60";
    el.style.maxHeight = `${Math.max(200, window.innerHeight - b.bottom - 16)}px`;
    el.style.overflowY = "auto";
  };
  const stop = () => {
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    details.removeEventListener("toggle", onToggle);
  };
  const onToggle = () => { if (!details.open) stop(); };
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  details.addEventListener("toggle", onToggle);
  place();
}

/** Closes every other open menu (not the ones this one sits in). */
function closeOthers(me: HTMLDetailsElement) {
  document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((d) => { if (d !== me && !d.contains(me)) d.open = false; });
}
