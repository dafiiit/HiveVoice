import type { ReactNode } from "react";

/** Fields nobody has to fill in: folded away until asked for. `quiet`: only a small line of text until opened (under a note). */
export function Optional({ label, quiet = false, children }: { label: string; quiet?: boolean; children: ReactNode }) {
  if (quiet) return (
    <details className="group">
      <summary className="inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1.5 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-90">▸</span>{label}
      </summary>
      <div className="mt-2 flex flex-col gap-4 border border-line bg-surface p-3">{children}</div>
    </details>
  );
  return (
    <details className="border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 font-bold">{label}</summary>
      <div className="flex flex-col gap-4 border-t border-line p-3">{children}</div>
    </details>
  );
}
