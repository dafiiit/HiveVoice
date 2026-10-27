import type { ReactNode } from "react";

/** Fields nobody has to fill in: folded away until asked for. */
export function Optional({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 font-bold">{label}</summary>
      <div className="flex flex-col gap-4 border-t border-line p-3">{children}</div>
    </details>
  );
}
