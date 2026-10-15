import { Glyph } from "./Glyph";
import { imageUrl } from "@/lib/images";

const SHAPES = ["circle", "ring", "diamond", "pill", "leaf", "keyhole", "quarter", "arch", "triangle", "split", "dots", "stripes", "flower", "bowl"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** First letter or digit of a name, upper case: "Möwe" or "Grüne Wiese" gives "M" or "G", "Ärztin" gives "Ä". */
export function initialOf(name: string) {
  const m = name.trim().match(/[\p{L}\p{N}]/u);
  return (m ? m[0] : "?").toLocaleUpperCase("de");
}

/**
 * Square avatar: the uploaded photo, otherwise the initial of the name (the real name,
 * or the pseudonym for anonymous members). Groups keep a geometric glyph on red.
 */
export function Avatar({ name, seed, size = 40, group = false, path }: { name: string; seed?: number; size?: number; group?: boolean; path?: string | null }) {
  const photo = imageUrl(path);
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt={name} title={name} width={size} height={size} loading="lazy" decoding="async"
        className="inline-block flex-none bg-chip object-cover" style={{ width: size, height: size }} />
    );
  }
  if (!group) {
    return (
      <span role="img" aria-label={name} title={name}
        className="inline-flex flex-none select-none items-center justify-center overflow-hidden font-bold"
        style={{ width: size, height: size, background: "var(--ink)", color: "var(--on-ink)", fontSize: Math.round(size * 0.54), lineHeight: 1, letterSpacing: "-0.04em" }}>
        {initialOf(name)}
      </span>
    );
  }
  const n = seed ?? hash(name);
  const shape = SHAPES[n % SHAPES.length];
  return (
    <span role="img" aria-label={name} title={name} className="inline-flex flex-none items-center justify-center overflow-hidden"
      style={{ width: size, height: size, background: "var(--red)" }}>
      <Glyph shape={shape} size={Math.round(size * 0.56)} color="var(--on-red)" rotate={(n % 4) * 90} />
    </span>
  );
}
