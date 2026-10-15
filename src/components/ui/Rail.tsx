import { Glyph } from "./Glyph";

export const PHASES = ["idea", "debate", "addressee", "implementation", "done"] as const;
export type Phase = (typeof PHASES)[number];
const SHAPES = ["burst", "bubble", "arch", "hammer", "flower"];

/** Five-step progress rail of a civic initiative. */
export function Rail({
  phase,
  labels,
  compact = false,
  exit,
  nowLabel,
}: {
  phase: Phase;
  labels: string[];
  compact?: boolean;
  exit?: string | null;
  nowLabel: string;
}) {
  const st = Math.max(0, PHASES.indexOf(phase));
  return (
    <div role="img" aria-label={exit ?? nowLabel} className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-5 gap-1">
        {labels.map((l, i) => {
          const done = i <= st;
          const cur = i === st && !exit;
          return (
            <div key={l} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-1.5 flex-col justify-center">
                <div className={done ? "h-1.5 bg-ink" : "h-px bg-ink"} />
              </div>
              {!compact && (
                <span className={`flex items-center gap-1.5 text-xs leading-tight ${cur ? "font-bold" : ""}`}>
                  {cur && <Glyph shape={SHAPES[i]} size={16} />}
                  {l}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {(compact || exit) && (
        <span className="flex items-center gap-2 text-[13px] font-bold leading-tight">
          <Glyph shape={exit ? "plus" : SHAPES[st]} size={16} rotate={exit ? 45 : 0} />
          {exit ?? nowLabel}
        </span>
      )}
    </div>
  );
}
