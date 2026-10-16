"use client";
import { useState, type CSSProperties, type ReactNode } from "react";

type Arrow = 1 | -1;
type Pulse = { n: number; arrow: Arrow; on: boolean };

/** Remembers the last press, so the arrow can answer it (and only a press, never a mere re-render). */
export function usePulse() {
  const [pulse, setPulse] = useState<Pulse>({ n: 0, arrow: 1, on: false });
  return [pulse, (arrow: Arrow, on: boolean) => setPulse((p) => ({ n: p.n + 1, arrow, on }))] as const;
}

/** The arrow springs back after a press. An up vote also throws a few specks. */
export function Pop({ arrow, pulse, children }: { arrow: Arrow; pulse: Pulse; children: ReactNode }) {
  const mine = pulse.n > 0 && pulse.arrow === arrow;
  const motion = !mine ? "" : !pulse.on ? "vote-undo" : arrow === 1 ? "vote-up" : "vote-down";
  return (
    <span className="relative inline-flex">
      <span key={mine ? pulse.n : 0} className={`inline-flex ${motion}`}>{children}</span>
      {mine && pulse.on && arrow === 1 && (
        <span key={`b${pulse.n}`} aria-hidden="true" className="burst">
          {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ "--a": `${i * 60 + 15}deg` } as CSSProperties} />)}
        </span>
      )}
    </span>
  );
}

/** A count that rolls: the old number leaves upwards when it grows, downwards when it shrinks. */
export function Roll({ value, className = "" }: { value: number; className?: string }) {
  const [seen, setSeen] = useState({ value, prev: value, n: 0 });
  if (seen.value !== value) setSeen({ value, prev: seen.value, n: seen.n + 1 });
  const dir = seen.value >= seen.prev ? 1 : -1;
  return (
    <span aria-live="polite" className={`roll tabular ${className}`} style={{ "--d": dir } as CSSProperties}>
      <span key={`i${seen.n}`} className={seen.n ? "roll-in" : undefined}>{seen.value}</span>
      {seen.n > 0 && <span key={`o${seen.n}`} aria-hidden="true" className="roll-out">{seen.prev}</span>}
    </span>
  );
}
