import { Glyph } from "./Glyph";
import { imageUrl } from "@/lib/images";

const SHAPES = ["circle", "ring", "diamond", "pill", "leaf", "keyhole", "quarter", "arch", "triangle", "split", "dots", "stripes", "flower", "bowl"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Square avatar: the uploaded photo, or a glyph that is stable per person. */
export function Avatar({ name, seed, size = 40, group = false, path }: { name: string; seed?: number; size?: number; group?: boolean; path?: string | null }) {
  const photo = imageUrl(path);
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt={name} title={name} width={size} height={size} loading="lazy" decoding="async"
        className="inline-block flex-none bg-chip object-cover" style={{ width: size, height: size }} />
    );
  }
  const n = seed ?? hash(name);
  const shape = SHAPES[n % SHAPES.length];
  const bg = group ? "var(--red)" : "var(--ink)";
  const fg = group ? "var(--on-red)" : "var(--on-ink)";
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="inline-flex flex-none items-center justify-center overflow-hidden"
      style={{ width: size, height: size, background: bg }}
    >
      <Glyph shape={shape} size={Math.round(size * 0.56)} color={fg} rotate={(n % 4) * 90} />
    </span>
  );
}
