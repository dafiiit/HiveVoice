// The note editor: tasks in Markdown, the buttons over the text and what the live view hides or replaces.
import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { addTask, blocks, hasTasks, moveTask, removeLine, setTaskText, taskCount, titleFrom, toggleTask } from "../src/components/editor/tasks";
import { block, insertText, linePrefix, wrap, type Target } from "../src/components/editor/commands";
import { livePreview } from "../src/components/editor/live";

describe("tasks in a text", () => {
  const md = "# Einkauf\n\n- [ ] Brot\n- [x] Milch\nNur Text\n\n## Später\n- [ ] Käse\n";
  it("reads headings, tasks and text line by line", () => {
    expect(blocks(md).map((b) => b.type)).toEqual(["heading", "task", "task", "text", "heading", "task"]);
    expect(taskCount(md)).toEqual({ total: 3, done: 1 });
    expect(hasTasks(md)).toBe(true);
    expect(hasTasks("Nur ein Text\n- einfach")).toBe(false);
  });
  it("ticks, renames, moves and removes a line without touching the others", () => {
    expect(toggleTask(md, 2).split("\n")[2]).toBe("- [x] Brot");
    expect(toggleTask(toggleTask(md, 2), 2)).toBe(md);
    expect(toggleTask(md, 4)).toBe(md);
    expect(setTaskText(md, 3, "Hafermilch").split("\n")[3]).toBe("- [x] Hafermilch");
    expect(moveTask(md, 2, 1).split("\n").slice(2, 4)).toEqual(["- [x] Milch", "- [ ] Brot"]);
    expect(moveTask(md, 3, 1)).toBe(md);
    expect(removeLine(md, 2).split("\n")[2]).toBe("- [x] Milch");
  });
  it("adds a task to the group it belongs to, or at the end", () => {
    expect(addTask(md, "Eier").split("\n")).toEqual(["# Einkauf", "", "- [ ] Brot", "- [x] Milch", "Nur Text", "", "## Später", "- [ ] Käse", "- [ ] Eier", ""]);
    expect(addTask(md, "Eier", 0).split("\n").slice(2, 6)).toEqual(["- [ ] Brot", "- [x] Milch", "- [ ] Eier", "Nur Text"]);
    expect(addTask("", "Eins")).toBe("- [ ] Eins\n");
  });
  it("does not read tasks inside code", () => {
    expect(blocks("```\n- [ ] kein Punkt\n```\n- [ ] Punkt").filter((b) => b.type === "task")).toHaveLength(1);
  });
  it("names a note after its first line when it has no title", () => {
    expect(titleFrom("", "# Wochenplan\n\nText", "Neue Notiz")).toBe("Wochenplan");
    expect(titleFrom("", "- [ ] **Brot** kaufen", "Neue Notiz")).toBe("Brot kaufen");
    expect(titleFrom("Mein Titel", "egal", "Neue Notiz")).toBe("Mein Titel");
    expect(titleFrom("", "", "Neue Notiz")).toBe("Neue Notiz");
    expect(titleFrom("ab", "x", "Neue Notiz")).toBe("Neue Notiz");
  });
});

function editor(doc: string, anchor = 0, head = anchor): Target & { text: () => string; sel: () => [number, number] } {
  const t = {
    state: EditorState.create({ doc, selection: EditorSelection.single(anchor, head) }),
    dispatch(spec: TransactionSpec) { t.state = t.state.update(spec).state; },
    text: () => t.state.doc.toString(),
    sel: (): [number, number] => [t.state.selection.main.from, t.state.selection.main.to],
  };
  return t;
}

describe("the buttons over the text", () => {
  it("bold wraps the selection, a second click takes it off, and an empty selection gets a placeholder", () => {
    const e = editor("ein Wort hier", 4, 8);
    wrap(e, "**", "**", "fett");
    expect(e.text()).toBe("ein **Wort** hier");
    expect(e.sel()).toEqual([6, 10]);
    wrap(e, "**", "**", "fett");
    expect(e.text()).toBe("ein Wort hier");
    const empty = editor("", 0);
    wrap(empty, "**", "**", "fett");
    expect(empty.text()).toBe("**fett**");
    expect(empty.sel()).toEqual([2, 6]);
  });
  it("a heading sign goes in front of the line and replaces another level", () => {
    const e = editor("Titel", 2);
    linePrefix(e, "## ");
    expect(e.text()).toBe("## Titel");
    linePrefix(e, "## ");
    expect(e.text()).toBe("Titel");
    const h1 = editor("# Titel", 3);
    linePrefix(h1, "## ");
    expect(h1.text()).toBe("## Titel");
  });
  it("a task sign turns a bullet into a task and back off", () => {
    const e = editor("- Brot\n- Milch", 0, 13);
    linePrefix(e, "- [ ] ");
    expect(e.text()).toBe("- [ ] Brot\n- [ ] Milch");
    linePrefix(e, "- [ ] ");
    expect(e.text()).toBe("Brot\nMilch");
  });
  it("a block (table, formula) gets lines of its own", () => {
    const e = editor("Satz davor. Satz danach.", 12);
    block(e, "$$\n", "E = mc^2", "\n$$");
    expect(e.text()).toBe("Satz davor.\n\n$$\nE = mc^2\n$$\n\nSatz danach.");
  });
  it("a photo goes on a line of its own", () => {
    const e = editor("Text", 4);
    insertText(e, "![a](img:x)", true);
    expect(e.text()).toBe("Text\n![a](img:x)\n");
  });
});

describe("the live view", () => {
  const look = (doc: string, at: number) => {
    const state = EditorState.create({ doc, selection: EditorSelection.single(Math.min(at, doc.length)), extensions: [markdown({ base: markdownLanguage })] });
    const found: { from: number; to: number; what: string }[] = [];
    livePreview(state).deco.between(0, doc.length, (from, to, v) => {
      const spec = v.spec as { widget?: { constructor: { name: string } }; class?: string };
      found.push({ from, to, what: spec.widget ? spec.widget.constructor.name : spec.class ?? "replace" });
    });
    return found;
  };
  it("hides the # of a heading unless the cursor is on that line", () => {
    expect(look("# Titel\n\nText", 12).some((d) => d.what === "replace" && d.from === 0 && d.to === 2)).toBe(true);
    expect(look("# Titel\n\nText", 3).some((d) => d.what === "replace" && d.from === 0)).toBe(false);
  });
  it("hides ** around bold text unless the cursor is in or next to it", () => {
    const hidden = (at: number) => look("a **fett** b", at).filter((d) => d.what === "replace").map((d) => [d.from, d.to]);
    expect(hidden(0)).toEqual([[2, 4], [8, 10]]);
    expect(hidden(5)).toEqual([]);
  });
  it("draws bullets and boxes to tick instead of - and - [ ]", () => {
    const d = look("- eins\n- [ ] zwei\n- [x] drei", 0);
    expect(d.filter((x) => x.what === "Bullet")).toHaveLength(1);
    expect(d.filter((x) => x.what === "Check").map((x) => [x.from, x.to])).toEqual([[7, 12], [18, 23]]);
    expect(d.some((x) => x.what === "cm-task-done")).toBe(true);
  });
  it("replaces photos, diagrams, formulas and tables, but shows the text under the cursor", () => {
    const img = "![Foto](img:0b8d3a52-1111-2222-3333-444455556666/0123456789abcdef0123456789abcdef.jpg)";
    expect(look(`${img}\n\nText`, 100).some((d) => d.what === "Picture")).toBe(true);
    expect(look(`${img}\n\nText`, 5).some((d) => d.what === "Picture")).toBe(false);
    expect(look("![Plan](diagram:0b8d3a52-1111-2222-3333-444455556666)\n\nx", 60).some((d) => d.what === "Drawing")).toBe(true);
    expect(look("Es gilt $a^2+b^2$ immer.\n\nEnde", 30).some((d) => d.what === "Formula")).toBe(true);
    expect(look("Es gilt $a^2+b^2$ immer.\n\nEnde", 12).some((d) => d.what === "Formula")).toBe(false);
    const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(look(`${table}\n\nEnde`, 35).some((d) => d.what === "Grid")).toBe(true);
    expect(look(`${table}\n\nEnde`, 3).some((d) => d.what === "Grid")).toBe(false);
  });
  it("leaves dollar signs alone when they are no formula, and code as it is", () => {
    expect(look("Das kostet 5 $ und 7 $ zusammen.", 0).some((d) => d.what === "Formula")).toBe(false);
    expect(look("`$a$` bleibt", 20).some((d) => d.what === "Formula")).toBe(false);
  });
});
