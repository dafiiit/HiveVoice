// Tasks in a Markdown text: "- [ ] item" and "- [x] item". A list is a note made of such lines; these helpers read and
// change the lines, so the "Liste" view, the checkboxes in the text and the file itself stay one and the same text.

const TASK = /^(\s*)([-*+]|\d+[.)])(\s+)\[([ xX])\](\s?)(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

export type Block =
  | { type: "heading"; line: number; level: number; text: string }
  | { type: "task"; line: number; done: boolean; text: string; indent: number }
  | { type: "text"; line: number; text: string };

/** The text split into headings, tasks and everything else, line by line (blank lines are left out). */
export function blocks(md: string): Block[] {
  const out: Block[] = [];
  let fenced = false;
  md.split("\n").forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; out.push({ type: "text", line, text: raw }); return; }
    if (fenced) { out.push({ type: "text", line, text: raw }); return; }
    const t = TASK.exec(raw);
    if (t) { out.push({ type: "task", line, done: t[4] !== " ", text: t[6], indent: Math.floor(t[1].replace(/\t/g, "  ").length / 2) }); return; }
    const h = HEADING.exec(raw);
    if (h) { out.push({ type: "heading", line, level: h[1].length, text: h[2] }); return; }
    if (raw.trim()) out.push({ type: "text", line, text: raw });
  });
  return out;
}

export const taskCount = (md: string) => {
  const all = blocks(md).filter((b) => b.type === "task");
  return { total: all.length, done: all.filter((b) => b.type === "task" && b.done).length };
};

export const hasTasks = (md: string) => /(^|\n)\s*([-*+]|\d+[.)])\s+\[[ xX]\]/.test(md);

const lines = (md: string) => md.split("\n");

/** Ticks or unticks the task on a line (a line that is no task stays as it is). */
export function toggleTask(md: string, line: number): string {
  const l = lines(md);
  const m = l[line] !== undefined ? TASK.exec(l[line]) : null;
  if (!m) return md;
  l[line] = `${m[1]}${m[2]}${m[3]}[${m[4] === " " ? "x" : " "}]${m[5] || " "}${m[6]}`;
  return l.join("\n");
}

/** New words for the task on a line, keeping its marker and state. */
export function setTaskText(md: string, line: number, text: string): string {
  const l = lines(md);
  const m = l[line] !== undefined ? TASK.exec(l[line]) : null;
  if (!m) return md;
  l[line] = `${m[1]}${m[2]}${m[3]}[${m[4]}] ${text.replace(/\n/g, " ")}`;
  return l.join("\n");
}

export function removeLine(md: string, line: number): string {
  const l = lines(md);
  if (line < 0 || line >= l.length) return md;
  l.splice(line, 1);
  return l.join("\n");
}

/** Swaps a line with the one above (-1) or below (1), only when both are tasks. */
export function moveTask(md: string, line: number, dir: -1 | 1): string {
  const l = lines(md);
  const to = line + dir;
  if (!l[line] || !l[to] || !TASK.test(l[line]) || !TASK.test(l[to])) return md;
  [l[line], l[to]] = [l[to], l[line]];
  return l.join("\n");
}

/**
 * Adds a task after the last task of the group that starts at `heading` (a line number of a heading), or after the last
 * line of text when there is no heading or no group.
 */
export function addTask(md: string, text: string, heading?: number): string {
  const item = `- [ ] ${text.replace(/\n/g, " ").trim()}`;
  const l = lines(md);
  const all = blocks(md);
  let insertAt = l.length;
  if (heading !== undefined) {
    const start = all.findIndex((b) => b.type === "heading" && b.line === heading);
    const after = start < 0 ? [] : all.slice(start + 1);
    const nextHeading = after.findIndex((b) => b.type === "heading");
    const group = nextHeading < 0 ? after : after.slice(0, nextHeading);
    const last = [...group].reverse().find((b) => b.type === "task") ?? group[group.length - 1];
    insertAt = last ? last.line + 1 : heading + 1;
  } else if (md.trim()) {
    const last = [...all].reverse().find((b) => b.type === "task");
    insertAt = last ? last.line + 1 : l.length;
  }
  // The text may end with an empty line (the final newline): the new task goes before it.
  if (insertAt === l.length && l[l.length - 1] === "") insertAt -= 1;
  if (!md.trim()) return `${item}\n`;
  l.splice(Math.max(0, insertAt), 0, item);
  return l.join("\n");
}

/** A name for a note that has none: its first line without Markdown signs, or the fallback. */
export function titleFrom(title: string, body: string, fallback: string): string {
  const t = title.trim();
  if (t.length >= 3) return t.slice(0, 200);
  for (const raw of body.split("\n")) {
    const plain = raw
      .replace(/^\s*(?:[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)+/, "")
      .replace(/^\[[ xX]\]\s*/, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~$]/g, "")
      .trim();
    if (plain.length >= 3) return plain.slice(0, 80);
  }
  return fallback;
}
