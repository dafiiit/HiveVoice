/** The ballot box. With `drop`, a folded ballot falls in and the box takes the weight; without it, the box just stands. */
export function BallotBox({ drop, size = 64 }: { drop?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 64 72" width={size} height={size * 72 / 64} aria-hidden="true" className="flex-none overflow-visible">
      {drop && (
        <g className="urne-paper">
          <rect x="22" y="6" width="20" height="26" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.5" />
          <rect x="26" y="12" width="12" height="2.5" fill="var(--ink)" />
          <rect x="26" y="18" width="8" height="2.5" fill="var(--ink)" />
        </g>
      )}
      <g className={drop ? "urne-box" : undefined}>
        <rect x="6" y="34" width="52" height="34" fill="var(--ink)" />
        <rect x="15" y="34" width="34" height="3" fill="var(--surface)" />
        <circle cx="32" cy="53" r="4.5" fill="var(--surface)" />
        <rect x="30.75" y="53" width="2.5" height="9" fill="var(--surface)" />
      </g>
    </svg>
  );
}
