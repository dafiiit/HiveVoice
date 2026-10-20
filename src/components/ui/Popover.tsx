"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The one dropdown of the app (filters, sorting, language, place). A native details element, so it opens
 * without JavaScript too; with JavaScript it closes on a click outside, on Escape and when a link inside is chosen.
 * `size`: "sm" (36 px) next to other tool bar controls, "md" (44 px) in the top bar.
 * `open` / `onOpenChange` make it controlled (for menus that close themselves after an action).
 */
export function Popover({ label, badge, align = "left", size = "sm", ariaLabel, open, onOpenChange, panelClassName, className = "", children }: {
  label: ReactNode; badge?: number; align?: "left" | "right"; size?: "sm" | "md"; ariaLabel?: string;
  open?: boolean; onOpenChange?: (open: boolean) => void; panelClassName?: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
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
    <details ref={ref} className={`group relative ${className}`} onToggle={(e) => onOpenChange?.(e.currentTarget.open)}>
      <summary role="button" aria-label={ariaLabel}
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 border border-line-strong bg-surface px-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden ${size === "md" ? "h-11" : "h-9"}`}>
        {label}
        {!!badge && <span className="inline-flex h-4 min-w-4 items-center justify-center bg-ink px-1 text-[11px] font-bold text-on-ink">{badge}</span>}
        <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div onClick={(e) => { if ((e.target as HTMLElement).closest("a")) { e.currentTarget.closest("details")?.removeAttribute("open"); onOpenChange?.(false); } }}
        className={panelClassName ?? `absolute z-40 mt-1 flex w-[min(320px,calc(100vw-3rem))] flex-col gap-3 border border-ink bg-surface p-3 ${align === "right" ? "right-0" : "left-0"}`}>
        {children}
      </div>
    </details>
  );
}
