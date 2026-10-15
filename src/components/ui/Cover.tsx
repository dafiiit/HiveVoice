import { imageUrl } from "@/lib/images";
const TONES = [
  { bg: "var(--chip)", ink: "var(--ink)", sun: "var(--red)", border: "transparent" },
  { bg: "var(--ink)", ink: "var(--on-ink)", sun: "var(--red)", border: "transparent" },
  { bg: "var(--paper)", ink: "var(--line-strong)", sun: "var(--ink)", border: "var(--line)" },
  { bg: "var(--surface)", ink: "var(--ink)", sun: "var(--red)", border: "var(--ink)" },
];

/** The first uploaded photo, or a neutral placeholder. */
export function Cover({ seed = 0, ratio = "3 / 2", label, className, src }: { seed?: number; ratio?: string; label?: string; className?: string; src?: string | null }) {
  const photo = imageUrl(src);
  if (photo) {
    return (
      <div className={`relative w-full overflow-hidden bg-chip ${className ?? ""}`} style={{ aspectRatio: ratio }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={label ?? ""} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        {label && (
          <span className="absolute bottom-3 left-3 inline-flex h-7 items-center border border-ink bg-surface px-2.5 text-xs font-bold">{label}</span>
        )}
      </div>
    );
  }
  const t = TONES[Math.abs(seed) % TONES.length];
  return (
    <div
      role="img"
      aria-label={label ? `Bildplatzhalter: ${label}` : "Bildplatzhalter"}
      className={`relative w-full overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: ratio, background: t.bg, border: `1px solid ${t.border}` }}
    >
      <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2 overflow-visible">
        <rect x="2" y="2" width="116" height="76" fill="none" stroke={t.ink} strokeWidth="4" />
        <path d="M2 78 L44 30 L70 58 L84 44 L118 78 Z" fill={t.ink} />
        <circle cx="88" cy="24" r="9" fill={t.sun} />
      </svg>
      {label && (
        <span className="absolute bottom-3 left-3 inline-flex h-7 items-center border border-ink bg-surface px-2.5 text-xs font-bold">
          {label}
        </span>
      )}
    </div>
  );
}
