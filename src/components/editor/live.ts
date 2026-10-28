// "Live" Markdown: the text stays Markdown (nothing is converted or lost), but is drawn as it will look: headings big, **bold**
// bold, lists with bullets, task lists with checkboxes, pictures, tables, formulas and diagrams as what they are. The signs of the
// Markdown are hidden until the cursor comes close, so one can write in the finished page and still reach every character.
import { EditorSelection, EditorState, Facet, StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { ensureSyntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { MIN_WIDTH, parseAlt, withWidth } from "./imageSize";

export type LiveConfig = {
  /** Where a photo written as `img:<path>` is served from. */
  imageUrl: (path: string) => string | null;
  /** The current page, so that "Schließen" in the diagram editor leads back here. */
  here: () => string;
  /** A Mermaid block is converted by the note (draw.io). */
  onMermaid?: (code: string) => void;
  labels: { externalImage: (alt: string) => string; image: string; resize: string; drawing: string; drawingOpen: string; drawingClosed: string; diagramLoading: string; diagramError: (e: string) => string; toDrawio: string };
};

export const liveConfig = Facet.define<LiveConfig, LiveConfig>({
  combine: (all) => all[0] ?? { imageUrl: () => null, here: () => "/", labels: { externalImage: (a) => a, image: "", resize: "", drawing: "", drawingOpen: "", drawingClosed: "", diagramLoading: "", diagramError: (e) => e, toDrawio: "" } },
});

const OWN_IMAGE = /^img:([0-9a-f-]{36}\/[0-9a-f]{32}\.jpg)$/;
const DIAGRAM = /^diagram:([0-9a-f-]{36})$/;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/* ───────────────────────── widgets ───────────────────────── */

class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { return el("span", "cm-bullet", "•"); }
}

/** The box of a task. It changes the text itself ("[ ]" ⇄ "[x]"), wherever the box currently is. */
class Check extends WidgetType {
  constructor(readonly done: boolean) { super(); }
  eq(o: Check) { return o.done === this.done; }
  toDOM(view: EditorView) {
    const box = el("input", "cm-check");
    box.type = "checkbox";
    box.checked = this.done;
    box.tabIndex = -1;
    box.setAttribute("aria-label", "✓");
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      if (view.state.readOnly || !view.state.facet(EditorView.editable)) return;
      const at = view.posAtDOM(box);
      const m = /\[([ xX])\]/.exec(view.state.doc.sliceString(at, Math.min(view.state.doc.length, at + 12)));
      if (!m) return;
      const from = at + m.index + 1;
      view.dispatch({ changes: { from, to: from + 1, insert: m[1] === " " ? "x" : " " }, userEvent: "input.toggle" });
    });
    return box;
  }
  ignoreEvent() { return true; }
}

class Rule extends WidgetType {
  eq() { return true; }
  toDOM() { return el("hr", "cm-rule"); }
}

/**
 * A picture drawn in the text, at the width written in its name (`![Name|300](…)`). The square at its lower right corner
 * changes the width by dragging; letting go writes the new width into the text (a double click on it goes back to the natural size).
 */
class Picture extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(o: Picture) { return o.src === this.src && o.alt === this.alt; }
  toDOM(view: EditorView) {
    const { name, width } = parseAlt(this.alt);
    const box = el("span", "cm-picture-box");
    const img = el("img", "cm-picture");
    img.alt = name;
    img.loading = "lazy";
    img.src = this.src;
    if (width) img.style.width = `${width}px`;
    img.addEventListener("load", () => view.requestMeasure());
    box.append(img);
    if (view.state.facet(EditorState.readOnly)) return box;
    const grip = el("span", "cm-picture-grip");
    grip.setAttribute("role", "slider");
    grip.setAttribute("aria-label", view.state.facet(liveConfig).labels.resize);
    grip.setAttribute("aria-valuenow", String(width ?? img.naturalWidth ?? 0));
    grip.tabIndex = 0;
    const write = (w: number | null) => {
      const pos = view.posAtDOM(box);
      const m = /^!\[([^\]]*)\]/.exec(view.state.doc.sliceString(pos, Math.min(view.state.doc.length, pos + 400)));
      if (!m) return;
      view.dispatch({ changes: { from: pos + 2, to: pos + 2 + m[1].length, insert: withWidth(m[1], w) } });
    };
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = img.getBoundingClientRect().width;
      const most = view.contentDOM.getBoundingClientRect().width;
      const move = (m: PointerEvent) => { img.style.width = `${Math.round(Math.min(most, Math.max(MIN_WIDTH, startW + m.clientX - startX)))}px`; };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        write(img.getBoundingClientRect().width);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
    grip.addEventListener("dblclick", (e) => { e.preventDefault(); write(null); });
    // The keyboard: arrows change the width by 10 % of the room, Home goes back to the natural size.
    grip.addEventListener("keydown", (e) => {
      const most = view.contentDOM.getBoundingClientRect().width;
      const now = img.getBoundingClientRect().width;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); write(Math.min(most, now + most / 10)); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); write(Math.max(MIN_WIDTH, now - most / 10)); }
      else if (e.key === "Home") { e.preventDefault(); write(null); }
    });
    box.append(grip);
    return box;
  }
  ignoreEvent() { return true; }
}

class Drawing extends WidgetType {
  constructor(readonly id: string, readonly title: string) { super(); }
  eq(o: Drawing) { return o.id === this.id && o.title === this.title; }
  toDOM(view: EditorView) {
    const cfg = view.state.facet(liveConfig);
    const box = el("span", "cm-drawing");
    const img = el("img");
    img.alt = this.title || cfg.labels.drawing;
    img.loading = "lazy";
    img.src = `/api/diagrams/${this.id}`;
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => { box.replaceChildren(el("span", "cm-drawing-closed", cfg.labels.drawingClosed)); view.requestMeasure(); });
    const caption = el("span", "cm-drawing-caption");
    caption.append(el("span", undefined, this.title));
    const open = el("a", undefined, cfg.labels.drawingOpen);
    open.href = `/links/${this.id}?edit=1&back=${encodeURIComponent(cfg.here())}`;
    caption.append(open);
    box.append(img, caption);
    return box;
  }
  ignoreEvent(e: Event) { return (e.target as HTMLElement | null)?.closest?.("a") != null; }
}

class Remote extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(o: Remote) { return o.text === this.text; }
  toDOM() { return el("span", "cm-remote-image", this.text); }
}

class Formula extends WidgetType {
  constructor(readonly code: string, readonly display: boolean) { super(); }
  eq(o: Formula) { return o.code === this.code && o.display === this.display; }
  toDOM(view: EditorView) {
    const box = el(this.display ? "div" : "span", this.display ? "cm-math cm-math-display" : "cm-math");
    box.append(el("code", undefined, this.code));
    void import("katex").then(({ default: katex }) => {
      box.innerHTML = katex.renderToString(this.code, { displayMode: this.display, throwOnError: false, trust: false, strict: "ignore", maxExpand: 500 });
      view.requestMeasure();
    });
    return box;
  }
}

let mermaidCount = 0;
class MermaidBlock extends WidgetType {
  constructor(readonly code: string) { super(); }
  eq(o: MermaidBlock) { return o.code === this.code; }
  toDOM(view: EditorView) {
    const cfg = view.state.facet(liveConfig);
    const wrap = el("div", "cm-mermaid");
    const picture = el("figure", "md-diagram", cfg.labels.diagramLoading);
    wrap.append(picture);
    if (cfg.onMermaid) {
      const b = el("button", "cm-mermaid-convert", cfg.labels.toDrawio);
      b.type = "button";
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => cfg.onMermaid?.(this.code));
      wrap.append(b);
    }
    const id = `cmm${++mermaidCount}`;
    const theme = document.documentElement.dataset.theme;
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral", fontFamily: "inherit" });
        const { svg } = await mermaid.render(id, this.code);
        picture.innerHTML = svg;
      } catch (e) {
        document.getElementById(`d${id}`)?.remove();
        picture.textContent = cfg.labels.diagramError(String((e as Error).message ?? e).split("\n")[0]);
      }
      view.requestMeasure();
    })();
    return wrap;
  }
  ignoreEvent(e: Event) { return (e.target as HTMLElement | null)?.closest?.("button") != null; }
}

/** A few signs inside table cells (**bold**, _italic_, `code`), as text nodes only: nothing from the note is ever read as HTML. */
function cellNodes(text: string): Node[] {
  const out: Node[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|~~(.+?)~~|\[([^\]]*)\]\([^)]*\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    if (m[2] !== undefined) out.push(el("strong", undefined, m[2]));
    else if (m[4] !== undefined) out.push(el("em", undefined, m[4]));
    else if (m[5] !== undefined) out.push(el("code", undefined, m[5]));
    else if (m[6] !== undefined) out.push(el("s", undefined, m[6]));
    else out.push(el("u", undefined, m[7]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

const cellsOf = (line: string) => {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
};

class Grid extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(o: Grid) { return o.source === this.source; }
  toDOM() {
    const rows = this.source.split("\n").filter((l) => l.trim());
    const wrap = el("div", "md-table cm-grid");
    const table = el("table");
    const align = (rows[1] ? cellsOf(rows[1]) : []).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : "left"));
    const head = el("thead");
    const hr = el("tr");
    cellsOf(rows[0] ?? "").forEach((c, i) => { const th = el("th"); th.style.textAlign = align[i] ?? "left"; th.append(...cellNodes(c)); hr.append(th); });
    head.append(hr);
    const body = el("tbody");
    for (const row of rows.slice(2)) {
      const tr = el("tr");
      cellsOf(row).forEach((c, i) => { const td = el("td"); td.style.textAlign = align[i] ?? "left"; td.append(...cellNodes(c)); tr.append(td); });
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    return wrap;
  }
}

/* ───────────────────────── decorations ───────────────────────── */

const hide = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string, style?: string) => Decoration.line({ class: cls, attributes: style ? { style } : undefined });

type Touch = (from: number, to: number) => boolean;

const children = (node: SyntaxNode, name: string) => {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) out.push(c);
  return out;
};

/** All decorations for a state. `touch`: the selection is inside or next to a range, so its signs are shown. */
export function livePreview(state: EditorState): { deco: DecorationSet; atomic: DecorationSet } {
  const out: Range<Decoration>[] = [];
  const hidden: Range<Decoration>[] = [];
  // What replaces text (hidden signs, widgets): the cursor jumps over these as over one character.
  const putReplace = (d: Range<Decoration>) => { out.push(d); hidden.push(d); };
  const doc = state.doc;
  const ranges = state.selection.ranges;
  // The signs show where the cursor is, but only while the editor has the focus: a note opened for reading looks finished.
  const active = state.field(focused, false) !== false;
  const touch: Touch = (from, to) => active && ranges.some((r) => r.from <= to && r.to >= from);
  const touchLine = (n: number) => { const l = doc.line(n); return touch(l.from, l.to); };
  const code: [number, number][] = [];
  const tree = ensureSyntaxTree(state, doc.length, 120);
  if (!tree) return { deco: Decoration.none, atomic: Decoration.none };
  const lineOf = (pos: number) => doc.lineAt(pos);

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      const { from, to } = ref;
      const name = ref.name;

      // Headings: big, and the "#" shows only on the line the cursor is on.
      const h = /^ATXHeading([1-6])$/.exec(name);
      if (h) {
        const l = lineOf(from);
        out.push(line(`cm-h cm-h${h[1]}`).range(l.from));
        const m = node.getChild("HeaderMark");
        if (m && !touchLine(l.number)) putReplace(hide.range(m.from, Math.min(to, m.to + 1)));
        return;
      }
      if (name === "SetextHeading1" || name === "SetextHeading2") {
        const a = lineOf(from), b = lineOf(to);
        out.push(line(`cm-h cm-h${name.endsWith("1") ? 1 : 2}`).range(a.from));
        if (b.number !== a.number) out.push(line("cm-setext-mark").range(b.from));
        return;
      }

      if (name === "StrongEmphasis" || name === "Emphasis" || name === "Strikethrough") {
        out.push(mark(name === "StrongEmphasis" ? "cm-strong" : name === "Emphasis" ? "cm-em" : "cm-strike").range(from, to));
        if (!touch(from, to)) for (const m of children(node, name === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark")) putReplace(hide.range(m.from, m.to));
        return;
      }

      if (name === "InlineCode") {
        code.push([from, to]);
        out.push(mark("cm-code").range(from, to));
        if (!touch(from, to)) for (const m of children(node, "CodeMark")) putReplace(hide.range(m.from, m.to));
        return false;
      }

      if (name === "Link") {
        const marks = children(node, "LinkMark");
        out.push(mark("cm-link").range(from, to));
        if (!touch(from, to) && marks.length >= 2) {
          putReplace(hide.range(marks[0].from, marks[0].to));
          putReplace(hide.range(marks[1].from, to));
        }
        return;
      }
      if (name === "URL" && node.parent?.name !== "Link" && node.parent?.name !== "Image") { out.push(mark("cm-url").range(from, to)); return; }

      if (name === "Image") {
        if (touch(from, to)) { out.push(mark("cm-image-source").range(from, to)); return false; }
        const src = node.getChild("URL");
        const url = src ? doc.sliceString(src.from, src.to) : "";
        const marks = children(node, "LinkMark");
        const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : "";
        const cfg = state.facet(liveConfig);
        const drawing = DIAGRAM.exec(url)?.[1];
        const own = OWN_IMAGE.exec(url)?.[1];
        const widget = drawing ? new Drawing(drawing, alt)
          : own ? new Picture(cfg.imageUrl(own) ?? "", alt)
          : new Remote(cfg.labels.externalImage(alt || cfg.labels.image));
        putReplace(Decoration.replace({ widget }).range(from, to));
        return false;
      }

      if (name === "Blockquote") {
        const a = lineOf(from).number, b = lineOf(to).number;
        for (let n = a; n <= b; n++) out.push(line("cm-quote").range(doc.line(n).from));
        return;
      }
      if (name === "QuoteMark") {
        const l = lineOf(from);
        if (!touchLine(l.number)) putReplace(hide.range(from, Math.min(l.to, to + 1)));
        return;
      }

      if (name === "ListItem") {
        const l = lineOf(from);
        let depth = 0;
        for (let p: SyntaxNode | null = node.parent; p; p = p.parent) if (p.name === "ListItem") depth++;
        out.push(line("cm-li", `--depth: ${depth}`).range(l.from));
        return;
      }
      if (name === "ListMark") {
        const l = lineOf(from);
        const item = node.parent;
        const task = item?.getChild("Task");
        const bullet = /^[-*+]$/.test(doc.sliceString(from, to));
        // Spaces in front of a nested item are drawn as a indent instead.
        if (from > l.from) putReplace(hide.range(l.from, from));
        if (task) {
          const tm = task.getChild("TaskMarker");
          if (tm) {
            const done = /[xX]/.test(doc.sliceString(tm.from, tm.to));
            putReplace(Decoration.replace({ widget: new Check(done) }).range(from, tm.to));
            if (done) out.push(mark("cm-task-done").range(Math.min(task.to, tm.to + 1), task.to));
          }
        } else if (bullet) {
          putReplace(Decoration.replace({ widget: new Bullet() }).range(from, to));
        } else {
          out.push(mark("cm-olmark").range(from, to));
        }
        return;
      }

      if (name === "HorizontalRule") {
        if (!touch(from, to)) putReplace(Decoration.replace({ widget: new Rule() }).range(from, to));
        return;
      }

      if (name === "FencedCode" || name === "CodeBlock") {
        code.push([from, to]);
        const a = lineOf(from).number, b = lineOf(to).number;
        const info = node.getChild("CodeInfo");
        const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : "";
        if (lang === "mermaid" && !touch(from, to) && b - a >= 1) {
          const text = node.getChild("CodeText");
          const codeText = text ? doc.sliceString(text.from, text.to) : "";
          putReplace(Decoration.replace({ widget: new MermaidBlock(codeText), block: true }).range(from, to));
          return false;
        }
        for (let n = a; n <= b; n++) out.push(line(`cm-code-line${n === a || (n === b && name === "FencedCode") ? " cm-fence" : ""}`).range(doc.line(n).from));
        return false;
      }

      if (name === "Table") {
        const a = lineOf(from), b = lineOf(to);
        if (!touch(from, to)) {
          putReplace(Decoration.replace({ widget: new Grid(doc.sliceString(from, to)), block: true }).range(from, to));
        } else {
          for (let n = a.number; n <= b.number; n++) out.push(line("cm-table-line").range(doc.line(n).from));
        }
        return false;
      }
    },
  });

  // Formulas: $…$ in a line and $$…$$ over lines. Not inside code.
  const text = doc.toString();
  const inCode = (a: number, b: number) => code.some(([x, y]) => a < y && b > x);
  const taken: [number, number][] = [];
  for (const m of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    const a = m.index!, b = a + m[0].length;
    if (inCode(a, b)) continue;
    taken.push([a, b]);
    if (touch(a, b)) { for (let n = lineOf(a).number; n <= lineOf(b).number; n++) out.push(line("cm-math-source").range(doc.line(n).from)); continue; }
    const la = lineOf(a), lb = lineOf(b);
    const wholeLines = a === la.from && b === lb.to;
    putReplace(Decoration.replace({ widget: new Formula(m[1].trim(), true), block: wholeLines }).range(a, b));
  }
  for (const m of text.matchAll(/(?<![\\$])\$(?![\s$])([^\n$]+?)(?<![\s\\])\$(?![\d$])/g)) {
    const a = m.index!, b = a + m[0].length;
    if (inCode(a, b) || taken.some(([x, y]) => a < y && b > x)) continue;
    if (touch(a, b)) { out.push(mark("cm-math-source").range(a, b)); continue; }
    putReplace(Decoration.replace({ widget: new Formula(m[1], false) }).range(a, b));
  }

  return { deco: Decoration.set(out, true), atomic: Decoration.set(hidden, true) };
}

const focusEffect = StateEffect.define<boolean>();
const focused = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(focusEffect)) return e.value; return v; },
  provide: () => EditorView.focusChangeEffect.of((_s, focusing) => focusEffect.of(focusing)),
});

/** The decorations are kept in a field: replacing line breaks and block widgets are only allowed from there. */
const field = StateField.define<{ deco: DecorationSet; atomic: DecorationSet }>({
  create: (state) => livePreview(state),
  update: (value, tr) => (tr.docChanged || tr.selection || tr.reconfigured || tr.effects.length ? livePreview(tr.state) : value),
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    // The cursor jumps over hidden signs and widgets instead of stopping inside them.
    EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
  ],
});

/** Opening a link with Ctrl or ⌘ + click (a plain click puts the cursor in, to change the text). */
const openLinks = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return false;
    const tree = ensureSyntaxTree(view.state, pos, 50);
    let n: SyntaxNode | null = tree?.resolveInner(pos, 1) ?? null;
    while (n && n.name !== "Link" && n.name !== "URL") n = n.parent;
    if (!n) return false;
    const url = n.name === "URL" ? view.state.doc.sliceString(n.from, n.to) : (() => { const u = n!.getChild("URL"); return u ? view.state.doc.sliceString(u.from, u.to) : ""; })();
    if (!/^https?:\/\//i.test(url)) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    e.preventDefault();
    return true;
  },
});

export const live: Extension = [focused, field, openLinks];

/** Selection that keeps a position valid after the text was replaced as a whole. */
export const clampSelection = (state: EditorState, next: string) => EditorSelection.single(Math.min(state.selection.main.anchor, next.length), Math.min(state.selection.main.head, next.length));
