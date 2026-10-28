"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { imageUrl } from "@/lib/images";
import "katex/dist/katex.min.css";
import { live, liveConfig, type LiveConfig } from "./live";
import { block, insertText, linePrefix, wrap } from "./commands";

/** What the buttons over the text can ask of the editor. */
export type EditorApi = {
  focus: () => void;
  wrap: (before: string, after?: string, placeholder?: string) => void;
  prefix: (p: string) => void;
  block: (before: string, inner: string, after?: string) => void;
  insert: (text: string, ownLine?: boolean) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** The finished-looking view (true) or the plain Markdown text (false). */
  live: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel: string;
  max: number;
  autoFocus?: boolean;
  labels: LiveConfig["labels"];
  onImages?: (files: File[]) => void;
  onMermaid?: (code: string) => void;
  apiRef?: MutableRefObject<EditorApi | null>;
  className?: string;
};

const inList = (state: EditorState) => /^\s*([-*+]|\d+[.)])\s/.test(state.doc.lineAt(state.selection.main.head).text);

/**
 * The text of a note. One text, two looks: drawn as the finished page (headings, lists, boxes to tick, pictures, tables,
 * formulas), or as plain Markdown. Typing, the buttons, pasting a photo and the keyboard work the same in both.
 */
export default function LiveEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  const modeC = useRef(new Compartment());
  const editC = useRef(new Compartment());
  const cfgC = useRef(new Compartment());

  useEffect(() => { latest.current = props; });

  const config = (p: Props): LiveConfig => ({
    imageUrl, here: () => window.location.pathname + window.location.search, onMermaid: p.onMermaid, labels: p.labels,
  });
  const edit = (ro: boolean) => [EditorState.readOnly.of(ro), EditorView.editable.of(!ro)];

  useEffect(() => {
    const p = latest.current;
    const state = EditorState.create({
      doc: p.value,
      selection: p.autoFocus ? EditorSelection.cursor(p.value.length) : undefined,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        keymap.of([
          // Tab moves in a list (and out of the editor elsewhere, so the keyboard is never trapped here).
          { key: "Tab", run: (v) => (inList(v.state) ? indentMore(v) : false), shift: (v) => (inList(v.state) ? indentLess(v) : false) },
          // The usual keys of a word processor, also named in the buttons' tooltips.
          { key: "Mod-b", run: (v) => { wrap(v, "**", "**", ""); return true; } },
          { key: "Mod-i", run: (v) => { wrap(v, "_", "_", ""); return true; } },
          { key: "Mod-k", run: (v) => { wrap(v, "[", "](https://)", ""); return true; } },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        modeC.current.of(p.live ? live : EditorView.editorAttributes.of({ class: "cm-source" })),
        cfgC.current.of(liveConfig.of(config(p))),
        editC.current.of(edit(!!p.readOnly)),
        p.placeholder ? placeholderExt(p.placeholder) : [],
        EditorView.contentAttributes.of({ "aria-label": p.ariaLabel, spellcheck: "true", autocapitalize: "sentences", enterkeyhint: "enter" }),
        EditorState.transactionFilter.of((tr) => (tr.docChanged && tr.newDoc.length > latest.current.max ? [] : tr)),
        EditorView.updateListener.of((u) => { if (u.docChanged) latest.current.onChange(u.state.doc.toString()); }),
        EditorView.domEventHandlers({
          paste(e) {
            const files = [...(e.clipboardData?.files ?? [])];
            if (!files.some((f) => f.type.startsWith("image/")) || !latest.current.onImages) return false;
            e.preventDefault();
            latest.current.onImages(files);
            return true;
          },
          drop(e) {
            const files = [...(e.dataTransfer?.files ?? [])];
            if (!files.some((f) => f.type.startsWith("image/")) || !latest.current.onImages) return false;
            e.preventDefault();
            latest.current.onImages(files);
            return true;
          },
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    if (p.autoFocus) v.focus();
    if (p.apiRef) {
      p.apiRef.current = {
        focus: () => v.focus(),
        wrap: (a, b, ph) => { wrap(v, a, b ?? a, ph ?? ""); v.focus(); },
        prefix: (x) => { linePrefix(v, x); v.focus(); },
        block: (a, inner, b) => { block(v, a, inner, b ?? ""); v.focus(); },
        insert: (text, own) => { insertText(v, text, own); v.focus(); },
      };
    }
    return () => { v.destroy(); view.current = null; if (p.apiRef) p.apiRef.current = null; };
  }, []);

  // The look, the right to write and the words follow the props.
  useEffect(() => {
    view.current?.dispatch({ effects: modeC.current.reconfigure(props.live ? live : EditorView.editorAttributes.of({ class: "cm-source" })) });
  }, [props.live]);
  useEffect(() => { view.current?.dispatch({ effects: editC.current.reconfigure(edit(!!props.readOnly)) }); }, [props.readOnly]);
  useEffect(() => {
    view.current?.dispatch({ effects: cfgC.current.reconfigure(liveConfig.of(config(props))) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the words and the Mermaid action change together
  }, [props.labels, props.onMermaid]);

  // The text changed from outside (a kept draft came back, a Mermaid block became a diagram): take it over.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const now = v.state.doc.toString();
    if (now === props.value) return;
    const sel = v.state.selection.main;
    v.dispatch({
      changes: { from: 0, to: now.length, insert: props.value },
      selection: EditorSelection.single(Math.min(sel.anchor, props.value.length), Math.min(sel.head, props.value.length)),
    });
  }, [props.value]);

  return <div ref={host} className={`cm-host ${props.className ?? ""}`} />;
}
