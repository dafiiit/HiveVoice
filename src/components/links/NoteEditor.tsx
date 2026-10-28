"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { lockResource, readableDiagrams, releaseResource, saveNote, suggestChange } from "@/lib/actions/links";
import { uploadImage } from "@/lib/upload";
import type { EditorApi } from "../editor/LiveEditor";
import { TaskView } from "../editor/TaskView";
import { blocks, titleFrom } from "../editor/tasks";
import { DiagramEditor } from "./DiagramEditor";
import { IconBold, IconBullets, IconChecklist, IconCode, IconDiagram, IconEye, IconFormula, IconHeading, IconImage, IconItalic, IconLink, IconMarkdown, IconTable, IconTask } from "../ui/Icons";
import { Toolbar } from "../editor/Toolbar";
import { TagPicker } from "../TagPicker";
import { Optional } from "../ui/Optional";
import { btn, field, segment, segments } from "../ui/styles";
import { Notice } from "@/components/ui/Page";
import { DraftNotice } from "../ui/DraftNotice";
import { useDraft } from "@/lib/drafts";

// The editor is loaded only where a note is written; it brings its own parts (CodeMirror, KaTeX, Mermaid on demand).
const LiveEditor = dynamic(() => import("../editor/LiveEditor"), {
  ssr: false,
  loading: () => <div className="min-h-[320px] border border-line-strong bg-surface lg:min-h-[480px]" aria-busy="true" />,
});

export type NoteDraft = { id?: string; title: string; description: string; body: string; tags: string[] };

const MAX = 100_000;
const TABLE = "| Spalte A | Spalte B |\n| --- | --- |\n| Wert | Wert |";
const FORMULA = "E = mc^2";
type View = "live" | "source" | "list";
const VIEW_KEY = "hv_note_view";

// A Mermaid block in the text, to swap it for the diagram made from it.
const MERMAID_BLOCK = /```mermaid[^\n]*\n([\s\S]*?)\n?```/g;
const swapMermaid = (body: string, code: string, by: string) => {
  let done = false;
  return body.replace(MERMAID_BLOCK, (all, inner: string) => {
    if (done || inner.trimEnd() !== code.trimEnd()) return all;
    done = true;
    return by;
  });
};

/** A note that is mostly tasks is opened as a list. */
const looksLikeList = (body: string) => {
  const lines = blocks(body).filter((b) => b.type !== "heading");
  const tasks = lines.filter((b) => b.type === "task").length;
  return tasks >= 2 && tasks / lines.length >= 0.6;
};

const readView = (id: string | undefined, body: string, start?: View): View => {
  try {
    const own = id ? localStorage.getItem(`${VIEW_KEY}:${id}`) : null;
    if (own === "live" || own === "source" || own === "list") return own;
  } catch { /* no storage */ }
  if (start) return start;
  if (looksLikeList(body)) return "list";
  try { return localStorage.getItem(VIEW_KEY) === "source" ? "source" : "live"; } catch { return "live"; }
};

type Status = "idle" | "saving" | "saved" | "failed" | "offline";

/**
 * Write a note. One text, three looks (the buttons at the top right): drawn as the finished page one can type in, as plain
 * Markdown, or as a list of tasks. It keeps itself: a new note is made, private, as soon as there is something to keep, and
 * every change is saved a moment later (into one version per sitting). Sharing is a separate step on the note's page.
 * `suggest`: for those who may only propose a change, the text is sent with a button instead.
 */
export function NoteEditor({ initial, ideas, mode = "edit", groupId = null, lock = false, unsaved = false, startView, autoFocus = false }: {
  initial: NoteDraft; ideas: string[]; mode?: "edit" | "suggest";
  /** A new note made for this group (otherwise it is private). */ groupId?: string | null;
  /** Others may write too: take the editing lock while the page is open. */ lock?: boolean;
  /** The starting text is not kept yet (an imported file): save it at once. */ unsaved?: boolean;
  startView?: View; autoFocus?: boolean;
}) {
  const t = useTranslations("knowledge");
  const td = useTranslations("docrights.page");
  const tl = useTranslations("links");
  const tc = useTranslations("common");
  const router = useRouter();
  // Inside Ich the note opens next to its list, elsewhere on its own page.
  const here = usePathname();
  const docHref = (id: string) => (here.startsWith("/me/") ? `/me/notes/${id}` : `/links/${id}`);
  const suggesting = !!initial.id && mode === "suggest";
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [body, setBody] = useState(initial.body);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [changeNote, setChangeNote] = useState("");
  const [view, setView] = useState<View>(startView ?? "live");
  const [uploading, setUploading] = useState(0);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [pending, start] = useTransition();
  const api = useRef<EditorApi | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // The id of the note: given, or made by the first save.
  const noteId = useRef<string | undefined>(initial.id);
  const startKept = unsaved ? "" : JSON.stringify([initial.title, initial.description, initial.body, initial.tags]);
  const kept = useRef(startKept);
  // What the server has, for the display: "Gespeichert" only shows while nothing has been typed since.
  const [keptShown, setKeptShown] = useState(startKept);
  const now = useRef({ title, description, body, tags });
  const sending = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaving = !suggesting && !lockedBy;

  // Nothing typed is lost: kept on the device until it is saved.
  const draft = useDraft(`note:${mode}:${initial.id ?? "new"}`, { title, description, body, tags, changeNote },
    (v) => { setTitle(v.title); setDescription(v.description); setBody(v.body); setTags(v.tags); setChangeNote(v.changeNote); });

  const draftRef = useRef(draft);
  const statusRef = useRef(status);
  useEffect(() => { now.current = { title, description, body, tags }; draftRef.current = draft; statusRef.current = status; });

  // A text that changed on the server (a version was restored, somebody else saved) is taken over when nothing here is waiting to be saved.
  const incoming = JSON.stringify([initial.title, initial.description, initial.body, initial.tags]);
  useEffect(() => {
    if (!noteId.current || incoming === kept.current) return;
    const n = now.current;
    if (JSON.stringify([n.title, n.description, n.body, n.tags]) !== kept.current) return;
    const [ti, de, bo, ta] = JSON.parse(incoming) as [string, string, string, string[]];
    setTitle(ti); setDescription(de); setBody(bo); setTags(ta);
    kept.current = incoming;
    setKeptShown(incoming);
  }, [incoming]);

  // The remembered look; the server cannot know it, so it comes after the first drawing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the remembered choice exists only in the browser
    setView(readView(initial.id, initial.body, startView));
  }, [initial.id, initial.body, startView]);
  const choose = (v: View) => {
    setView(v);
    try {
      if (noteId.current) localStorage.setItem(`${VIEW_KEY}:${noteId.current}`, v);
      if (v !== "list") localStorage.setItem(VIEW_KEY, v);
    } catch { /* no storage */ }
  };

  const save = async (): Promise<void> => {
    if (!autosaving) return;
    if (sending.current) { again.current = true; return; }
    const cur = now.current;
    const snapshot = JSON.stringify([cur.title, cur.description, cur.body, cur.tags]);
    if (snapshot === kept.current) return;
    // A new note exists as soon as there is something to keep.
    if (!noteId.current && !cur.title.trim() && !cur.body.trim()) return;
    sending.current = true;
    setStatus("saving");
    try {
      const res = await saveNote({ id: noteId.current, title: cur.title, description: cur.description, body: cur.body, tags: cur.tags, groupId: noteId.current ? null : groupId, autosave: true });
      if (res.ok) {
        kept.current = snapshot;
        setKeptShown(snapshot);
        if (!noteId.current) {
          // The address stays the one of the new note's page: another address would draw another page and start the editor
          // anew in the middle of typing. The note now exists, shows up in the list next to the editor, and is found there.
          noteId.current = res.data;
        }
        // Only what is saved may leave the device: text typed meanwhile stays kept until the next save.
        if (JSON.stringify([now.current.title, now.current.description, now.current.body, now.current.tags]) === snapshot) draftRef.current.clear();
        setStatus("saved");
        setError(null);
      } else if (res.error === "locked") {
        setLockedBy("?");
        setStatus("idle");
      } else {
        setStatus("failed");
      }
    } catch {
      // The connection is gone: the text stays on the device and goes out again when there is one.
      setStatus("offline");
    } finally {
      sending.current = false;
      if (again.current) { again.current = false; void save(); }
    }
  };
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });

  // A moment after each change, when the page is hidden or left, and when the connection comes back.
  useEffect(() => {
    if (!autosaving) return;
    timer.current = setTimeout(() => void saveRef.current(), 1200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [autosaving, title, description, body, tags]);
  useEffect(() => {
    if (!autosaving) return;
    const flush = () => { void saveRef.current(); };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    const retry = setInterval(() => { if (statusRef.current === "offline" || statusRef.current === "failed") flush(); }, 15_000);
    return () => { window.removeEventListener("online", flush); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); clearInterval(retry); flush(); };
  }, [autosaving]);

  // A note others may edit too: nobody else writes at the same time (a lock for five minutes, renewed while the page is open).
  useEffect(() => {
    if (!lock || !initial.id || suggesting) return;
    const id = initial.id;
    let alive = true;
    const take = () => lockResource(id).then((res) => {
      if (!alive) return;
      if (!res.ok) setLockedBy(res.error === "locked" ? "?" : null); else setLockedBy(null);
    });
    take();
    const beat = setInterval(take, 60_000);
    return () => { alive = false; clearInterval(beat); void releaseResource(id); };
  }, [lock, suggesting, initial.id]);

  /** Uploads photos (shrunk in the browser) and puts them where the cursor is, as `![name](img:path)`. */
  const addImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setError(null);
    for (const file of images) {
      setUploading((n) => n + 1);
      const res = await uploadImage(file, 1600);
      setUploading((n) => n - 1);
      if (!res.ok) { setError(t("imageError")); continue; }
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "").slice(0, 80) || t("image");
      api.current?.insert(`![${alt}](img:${res.path})`, true);
    }
  };

  // Mermaid → draw.io: the block opens in draw.io over the note; once saved there, the note points to the diagram.
  const [converting, setConverting] = useState<string | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const toDrawio = (code: string) => { setSwapNote(null); setConverting(code); };

  const send = () => start(async () => {
    setError(null);
    const sent = await suggestChange(initial.id!, { title: titleFrom(title, body, t("newNoteTitle")), description, body, note: changeNote });
    if (!sent.ok) return setError(t.has(`errors.${sent.error}`) ? t(`errors.${sent.error}` as "errors.invalid") : tc(`errors.${sent.error}` as "errors.unknown"));
    draft.clear();
    router.push(`${docHref(initial.id ?? "")}?suggested=1`);
    router.refresh();
  });

  const readOnly = !!lockedBy;
  const shown: Status = status === "saved" && JSON.stringify([title, description, body, tags]) !== keptShown ? "idle" : status;
  const labels = {
    externalImage: (alt: string) => t("externalImage", { alt }), image: t("image"), resize: t("imageResize"), drawing: t("drawing"), drawingOpen: t("drawingOpen"), drawingClosed: t("drawingClosed"),
    diagramLoading: t("diagramLoading"), diagramError: (error: string) => t("diagramError", { error }), toDrawio: t("toDrawio"),
  };

  return (
    <div className="flex flex-col gap-4">
      <DraftNotice draft={draft} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} readOnly={readOnly} aria-label={t("noteTitle")}
        placeholder={titleFrom("", body, t("titlePlaceholder"))}
        className="m-0 min-h-12 w-full border-0 border-b-2 border-line-strong bg-transparent px-0 pb-2 text-[28px] font-bold leading-tight tracking-tight text-ink placeholder:text-muted focus:border-ink focus:outline-none" />

      <div className="flex flex-col gap-2">
        <Toolbar label={t("toolbar")} moreLabel={t("moreTools")} backLabel={t("back")} tools={view === "list" || readOnly ? [] : [
          { key: "heading", label: t("heading"), icon: <IconHeading />, run: () => api.current?.prefix("## ") },
          { key: "bold", label: t("bold"), icon: <IconBold />, keys: "B", run: () => api.current?.wrap("**", "**", t("bold")) },
          { key: "italic", label: t("italic"), icon: <IconItalic />, keys: "I", run: () => api.current?.wrap("_", "_", t("italic")) },
          { key: "task", label: t("task"), icon: <IconTask />, run: () => api.current?.prefix("- [ ] ") },
          { key: "list", label: t("list"), icon: <IconBullets />, run: () => api.current?.prefix("- ") },
          { key: "link", label: t("link"), icon: <IconLink />, keys: "K", run: () => api.current?.wrap("[", "](https://)", t("link")) },
          { key: "image", label: uploading > 0 ? t("imageUploading") : t("image"), icon: <IconImage size={18} />, disabled: uploading > 0, run: () => picker.current?.click() },
          { key: "diagram", label: t("drawingPick"), icon: <IconDiagram size={18} />, panel: (close) => <DrawingPicker t={t} onPick={(d) => { api.current?.insert(`![${d.title.replace(/[[\]]/g, "")}](diagram:${d.id})`, true); close(); }} /> },
          { key: "table", label: t("table"), icon: <IconTable />, run: () => api.current?.block("", TABLE) },
          { key: "code", label: t("code"), icon: <IconCode />, run: () => api.current?.wrap("`", "`", "code") },
          { key: "formula", label: t("formula"), icon: <IconFormula />, run: () => api.current?.block("$$\n", FORMULA, "\n$$") },
        ]} side={
          <div role="radiogroup" aria-label={t("viewLabel")} className={segments}>
            {([["live", t("viewLive"), <IconEye key="i" size={18} />], ["source", t("viewSource"), <IconMarkdown key="i" />], ["list", t("viewList"), <IconChecklist key="i" />]] as const).map(([v, name, icon]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={name} title={name} onClick={() => choose(v)} className={`${segment(view === v)} w-10 px-0`}>
                {icon}
              </button>
            ))}
          </div>
        } />
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = ""; }} />
        {swapNote && <Notice tone="status">{swapNote}</Notice>}
        {readOnly && <Notice tone="error">{t("readOnlyLocked")}</Notice>}

        {view === "list"
          ? <TaskView body={body} onChange={setBody} readOnly={readOnly} />
          : <LiveEditor value={body} onChange={setBody} live={view === "live"} readOnly={readOnly} max={MAX} autoFocus={autoFocus}
              placeholder={t("notePlaceholder")} ariaLabel={t("noteBody")} labels={labels} apiRef={api}
              onImages={(files) => void addImages(files)} onMermaid={suggesting ? undefined : toDrawio} />}

        {converting !== null && (
          <div role="dialog" aria-modal="true" aria-label={t("toDrawio")} className="fixed inset-0 z-50 bg-paper">
            <DiagramEditor title={title.trim().length >= 3 ? t("diagramFrom", { title: title.trim() }).slice(0, 200) : t("diagramFromNote")} svg="" base="/me/diagrams" mermaid={converting}
              onSaved={(id, name) => { const code = converting; setBody((b) => swapMermaid(b, code, `![${name.replace(/[[\]]/g, "")}](diagram:${id})`)); setSwapNote(t("convertedNote")); }}
              onClose={() => setConverting(null)} />
          </div>
        )}
        <span className="flex flex-wrap justify-between gap-2 text-xs text-muted" aria-live="polite">
          {view !== "list" && <span>{body.length.toLocaleString("de-DE")} / {MAX.toLocaleString("de-DE")}</span>}
          {autosaving && shown !== "idle" && <span className={shown === "failed" ? "font-bold text-red" : ""}>{shown === "offline" ? t("offline") : t(`autosave.${shown}`)}</span>}
        </span>
      </div>

      <Optional label={t("details")}>
        <label className={field.label}>{tl("descriptionLabel")}
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} readOnly={readOnly} className={field.textarea} />
        </label>
        <TagPicker label={tl("tagsLabel")} value={tags} onChange={setTags} suggestions={ideas} placeholder={tl("tagsPlaceholder")} max={10} />
      </Optional>

      {error && <Notice tone="error">{error}</Notice>}
      {suggesting && (
        <>
          <label className={field.label}>{td("suggestNote")}
            <input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} maxLength={300} placeholder={td("changeNotePlaceholder")} className={field.input} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending || !body.trim() || changeNote.trim().length < 5} onClick={send} className={btn.primary}>{pending ? t("saving") : td("suggestSend")}</button>
            <button type="button" disabled={pending} onClick={() => { draft.clear(); router.push(docHref(initial.id ?? "")); }} className={btn.secondary}>{t("cancel")}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Puts a draw.io diagram from Ich → Diagramme into the text; the list loads when it opens. */
function DrawingPicker({ t, onPick }: { t: (key: "drawingPick" | "drawingNone" | "drawingNew" | "drawingHint") => string; onPick: (d: { id: string; title: string }) => void }) {
  const [items, setItems] = useState<{ id: string; title: string }[] | null>(null);
  // The list loads when the menu opens.
  useEffect(() => { void readableDiagrams().then((res) => setItems(res.ok ? res.data : [])); }, []);
  return (
    <div className="flex flex-col" role="group" aria-label={t("drawingPick")}>
      {items === null ? <span className="py-2 text-sm text-muted">…</span>
        : items.length === 0 ? <span className="py-2 text-sm text-muted">{t("drawingNone")}</span>
        : items.map((d) => (
          <button key={d.id} type="button" onClick={() => onPick(d)}
            className="flex h-10 items-center truncate border-0 border-b border-line bg-transparent px-0 text-left text-ink">{d.title}</button>
        ))}
      <a href="/me/diagrams/new" target="_blank" rel="noopener" className="flex h-10 items-center text-ink underline">{t("drawingNew")}</a>
      <span className="text-xs text-muted">{t("drawingHint")}</span>
    </div>
  );
}
