/** A small dropdown that works without JavaScript (a native details element). */
export function Popover({ label, badge, align = "left", children }: { label: React.ReactNode; badge?: number; align?: "left" | "right"; children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 border border-line-strong bg-transparent px-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
        {label}
        {!!badge && <span className="inline-flex h-4 min-w-4 items-center justify-center bg-ink px-1 text-[11px] font-bold text-on-ink">{badge}</span>}
        <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className={`absolute z-20 mt-1 flex w-[min(320px,calc(100vw-3rem))] flex-col gap-3 border border-ink bg-surface p-3 ${align === "right" ? "right-0" : "left-0"}`}>{children}</div>
    </details>
  );
}
