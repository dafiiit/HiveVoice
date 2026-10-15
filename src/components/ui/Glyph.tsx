// Geometric glyphs from the HiveVoice design. Purely decorative.
const circ = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;

function burst() {
  let d = "";
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 24 : 10.5;
    d += (i === 0 ? "M" : "L") + (24 + r * Math.cos(a)).toFixed(2) + " " + (24 + r * Math.sin(a)).toFixed(2);
  }
  return d + "Z";
}

export const SHAPES: Record<string, [string, "nonzero" | "evenodd"]> = {
  burst: [burst(), "nonzero"],
  hourglass: ["M0 0H48L24 24L48 48H0L24 24Z", "nonzero"],
  arch: ["M0 48V24A24 24 0 0 1 48 24V48Z", "nonzero"],
  stairs: ["M0 48V36H12V24H24V12H36V0H48V48Z", "nonzero"],
  flower: [circ(12, 12, 12) + circ(36, 12, 12) + circ(12, 36, 12) + circ(36, 36, 12) + "M12 12H36V36H12Z", "nonzero"],
  circle: [circ(24, 24, 24), "nonzero"],
  ring: [circ(24, 24, 24) + circ(24, 24, 12), "evenodd"],
  quarter: ["M0 48V0A48 48 0 0 1 48 48Z", "nonzero"],
  bowl: ["M0 12H48A24 24 0 0 1 0 12Z", "nonzero"],
  plus: ["M16 0H32V16H48V32H32V48H16V32H0V16H16Z", "nonzero"],
  diamond: ["M24 0L48 24L24 48L0 24Z", "nonzero"],
  triangle: ["M0 48L24 0L48 48Z", "nonzero"],
  leaf: ["M0 48C0 21 21 0 48 0C48 27 27 48 0 48Z", "nonzero"],
  keyhole: [circ(24, 15, 15) + "M16 24H32L37 48H11Z", "nonzero"],
  pill: ["M12 12H36A12 12 0 0 1 36 36H12A12 12 0 0 1 12 12Z", "nonzero"],
  dots: [[8, 24, 40].map((x) => [8, 24, 40].map((y) => circ(x, y, 5.5)).join("")).join(""), "nonzero"],
  stripes: ["M0 0H12L0 12Z M0 24L24 0H36L0 36Z M0 48L48 0V12L12 48Z M24 48L48 24V36L36 48Z", "nonzero"],
  split: ["M0 0H24V48H0Z M24 0A24 24 0 0 1 24 48Z", "nonzero"],
  bubble: ["M0 4H48V34H22L8 46V34H0Z", "nonzero"],
  hammer: ["M2 4H32L42 9V19H2Z M15 19H27V47H15Z", "nonzero"],
  lupe: [circ(19, 19, 17) + circ(19, 19, 9) + "M31.5 35L35 31.5L48 44.5L44.5 48Z", "evenodd"],
  gift: ["M0 26H48A24 22 0 0 1 0 26Z" + circ(24, 12, 9), "nonzero"],
};

export type GlyphShape = keyof typeof SHAPES;

export function Glyph({
  shape,
  size = 48,
  color = "currentColor",
  rotate = 0,
  className,
}: {
  shape: string;
  size?: number;
  color?: string;
  rotate?: number;
  className?: string;
}) {
  const [d, rule] = SHAPES[shape] ?? SHAPES.burst;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: "block", flex: "0 0 auto", transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <path d={d} fill={color} fillRule={rule} />
    </svg>
  );
}
