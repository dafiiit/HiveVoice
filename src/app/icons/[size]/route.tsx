import { ImageResponse } from "next/og";

// PNG app icons for the web app manifest, drawn from the logo.
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : raw === "180" ? 180 : 192;
  const s = size / 100;
  const hex = (cx: number, cy: number) =>
    [[0, -11], [9.53, -5.5], [9.53, 5.5], [0, 11], [-9.53, 5.5], [-9.53, -5.5]].map(([x, y]) => `${(cx + x) * s},${(cy + y) * s}`).join(" ");
  const cells: [number, number][] = [[72.5, 50], [27.5, 50], [61.25, 30.5], [38.75, 30.5], [61.25, 69.5], [38.75, 69.5]];
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#f4f4f4", display: "flex" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {cells.map(([x, y]) => <polygon key={`${x}-${y}`} points={hex(x, y)} fill="#111111" />)}
          <polygon points={hex(50, 50)} fill="#e2001a" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
