// What the buttons over the text do. They change the Markdown (the text is the only truth), also in the finished-looking view.
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

/** All that is needed of an editor: tests use a plain object, the page the real view. */
export type Target = { state: EditorState; dispatch: (spec: TransactionSpec) => void };

/**
 * Puts signs around the selection (or around a placeholder when nothing is selected). When the selection is already
 * wrapped in exactly these signs, a second click takes them off again.
 */
export function wrap(view: Target, before: string, after = before, placeholder = ""): void {
  const { state } = view;
  const doc = state.doc;
  const changes: { from: number; to: number; insert: string }[] = [];
  const selection: { anchor: number; head: number }[] = [];
  // Positions of the selection in the new text: every earlier change moves the later ones.
  let delta = 0;
  for (const r of state.selection.ranges) {
    const picked = doc.sliceString(r.from, r.to);
    const around = !r.empty && before !== "" && doc.sliceString(Math.max(0, r.from - before.length), r.from) === before && doc.sliceString(r.to, Math.min(doc.length, r.to + after.length)) === after;
    const inside = !r.empty && before !== "" && picked.length >= before.length + after.length && picked.startsWith(before) && picked.endsWith(after);
    if (around) {
      changes.push({ from: r.from - before.length, to: r.from, insert: "" }, { from: r.to, to: r.to + after.length, insert: "" });
      selection.push({ anchor: r.from - before.length + delta, head: r.to - before.length + delta });
      delta -= before.length + after.length;
    } else if (inside) {
      changes.push({ from: r.from, to: r.from + before.length, insert: "" }, { from: r.to - after.length, to: r.to, insert: "" });
      selection.push({ anchor: r.from + delta, head: r.to - before.length - after.length + delta });
      delta -= before.length + after.length;
    } else {
      const text = picked || placeholder;
      changes.push({ from: r.from, to: r.to, insert: before + text + after });
      selection.push({ anchor: r.from + before.length + delta, head: r.from + before.length + text.length + delta });
      delta += before.length + text.length + after.length - (r.to - r.from);
    }
  }
  view.dispatch({
    changes,
    selection: EditorSelection.create(selection.map((x) => EditorSelection.range(x.anchor, x.head)), state.selection.mainIndex),
    scrollIntoView: true,
    userEvent: "input.format",
  });
}

/** Adds a sign in front of the lines of the selection ("## ", "- ", "> "), or takes it off when every line has it. */
export function linePrefix(view: Target, prefix: string): void {
  const { state } = view;
  const doc = state.doc;
  const lines: number[] = [];
  for (const r of state.selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) if (!lines.includes(n)) lines.push(n);
  }
  const heading = /^#{1,6} /.test(prefix);
  const task = prefix === "- [ ] ";
  const has = (text: string) => (task ? /^- \[[ xX]\] /.test(text) : text.startsWith(prefix));
  const allHave = lines.every((n) => has(doc.line(n).text));
  const changes = lines.map((n) => {
    const l = doc.line(n);
    if (allHave) {
      const len = task ? /^- \[[ xX]\] /.exec(l.text)![0].length : prefix.length;
      return { from: l.from, to: l.from + len, insert: "" };
    }
    if (has(l.text)) return null;
    // A heading changes level instead of getting a second sign; a plain bullet becomes a task.
    const old = heading ? /^#{1,6} /.exec(l.text)?.[0] : task ? /^[-*+] (?!\[[ xX]\])/.exec(l.text)?.[0] : undefined;
    return { from: l.from, to: l.from + (old?.length ?? 0), insert: prefix };
  }).filter((c): c is { from: number; to: number; insert: string } => !!c);
  if (!changes.length) return;
  view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" });
}

/** A block of its own (table, formula): on its own lines, with an empty line around it. The selection (or `inner`) ends up selected. */
export function block(view: Target, before: string, inner: string, after = ""): void {
  const { state } = view;
  const doc = state.doc;
  const r = state.selection.main;
  const startLine = doc.lineAt(r.from), endLine = doc.lineAt(r.to);
  const textBefore = doc.sliceString(startLine.from, r.from).trim() !== "";
  const textAfter = doc.sliceString(r.to, endLine.to).trim() !== "";
  const prevFilled = startLine.number > 1 && doc.line(startLine.number - 1).text.trim() !== "";
  const nextFilled = endLine.number < doc.lines && doc.line(endLine.number + 1).text.trim() !== "";
  const lead = textBefore ? "\n\n" : prevFilled ? "\n" : "";
  const tail = textAfter ? "\n\n" : nextFilled ? "\n" : "";
  // Spaces next to the block would stay as stray blanks at the end of the line above and the start of the line below.
  let from = textBefore ? r.from : startLine.from, to = textAfter ? r.to : endLine.to;
  while (textBefore && from > startLine.from && doc.sliceString(from - 1, from) === " ") from--;
  while (textAfter && to < endLine.to && doc.sliceString(to, to + 1) === " ") to++;
  const content = doc.sliceString(r.from, r.to) || inner;
  const start = from + lead.length + before.length;
  view.dispatch({
    changes: { from, to, insert: `${lead}${before}${content}${after}${tail}` },
    selection: EditorSelection.range(start, start + content.length),
    scrollIntoView: true,
    userEvent: "input.format",
  });
}

/** Text at the cursor, on a line of its own when `ownLine` (a photo, a diagram). */
export function insertText(view: Target, text: string, ownLine = false): void {
  const { state } = view;
  const r = state.selection.main;
  const doc = state.doc;
  const before = doc.sliceString(Math.max(0, r.to - 1), r.to);
  const lead = ownLine && r.to > 0 && before !== "\n" ? "\n" : "";
  const tail = ownLine && doc.sliceString(r.to, r.to + 1) !== "\n" ? "\n" : "";
  const insert = `${lead}${text}${tail}`;
  view.dispatch({
    changes: { from: r.to, to: r.to, insert },
    selection: EditorSelection.cursor(r.to + insert.length),
    scrollIntoView: true,
    userEvent: "input.paste",
  });
}
