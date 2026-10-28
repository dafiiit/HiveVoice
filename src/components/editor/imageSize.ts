// The width of a picture in a note, written into its alt text the way Obsidian does: `![Name|300](img:…)` is 300 px wide.
// The text stays plain Markdown; other programs show the name with "|300", nothing breaks.

const SIZE = /^([\s\S]*?)\|(\d{2,4})$/;
export const MIN_WIDTH = 48;
export const MAX_WIDTH = 2000;

/** The name and, when one was set, the width (px) of a picture's alt text. */
export function parseAlt(alt: string): { name: string; width: number | null } {
  const m = SIZE.exec(alt.trim());
  if (!m) return { name: alt, width: null };
  return { name: m[1].trim(), width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(m[2]))) };
}

/** The alt text with this width (null: back to the natural size). */
export function withWidth(alt: string, width: number | null): string {
  const { name } = parseAlt(alt);
  if (width === null) return name;
  return `${name}|${Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)))}`;
}
