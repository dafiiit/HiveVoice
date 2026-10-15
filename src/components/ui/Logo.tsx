export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      <g fill="currentColor">
        <polygon points="72.5,39 82.03,44.5 82.03,55.5 72.5,61 62.97,55.5 62.97,44.5" />
        <polygon points="27.5,39 37.03,44.5 37.03,55.5 27.5,61 17.97,55.5 17.97,44.5" />
        <polygon points="61.25,19.5 70.78,25 70.78,36 61.25,41.5 51.72,36 51.72,25" />
        <polygon points="38.75,19.5 48.28,25 48.28,36 38.75,41.5 29.22,36 29.22,25" />
        <polygon points="61.25,58.5 70.78,64 70.78,75 61.25,80.5 51.72,75 51.72,64" />
        <polygon points="38.75,58.5 48.28,64 48.28,75 38.75,80.5 29.22,75 29.22,64" />
      </g>
      <polygon points="50,39 59.53,44.5 59.53,55.5 50,61 40.47,55.5 40.47,44.5" fill="var(--red)" />
    </svg>
  );
}

export function Logo({ size = 40, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span role="img" aria-label="HiveVoice" className="inline-flex items-center" style={{ gap: Math.round(size * 0.18) }}>
      <LogoMark size={size} />
      {wordmark && (
        <span style={{ fontSize: Math.round(size * 0.6), letterSpacing: "-0.04em", lineHeight: 1 }} className="whitespace-nowrap">
          <span className="font-bold">hive</span>
          <span className="font-normal">voice</span>
        </span>
      )}
    </span>
  );
}
