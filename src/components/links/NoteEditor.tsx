"use client";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { lockResource, readableDiagrams, releaseResource, saveNote, suggestChange } from "@/lib/actions/links";
import { uploadImage } from "@/lib/upload";
import { Markdown } from "../Markdown";
import { IconColumns, IconEye, IconImage } from "../ui/Icons";
import { TagPicker } from "../TagPicker";
import { btn, field } from "../ui/styles";
import { AccessPicker, type Access } from "./AccessPicker";
import { Notice } from "@/components/ui/Page";
import { Popover } from "../ui/Popover";

type Group = { id: string; slug: string; name: string };
export type NoteDraft = { id?: string; title: string; description: string; body: string; tags: string[] };

const MAX = 100_000;
const MERMAID = "```mermaid\nflowchart LR\n  A[Idee] --> B[Gruppe]\n  B --> C{Abstimmung}\n  C -->|Ja| D[Umsetzung]\n```\n";
const TABLE = "| Spalte A | Spalte B |\n| --- | --- |\n| Wert | Wert |\n";
const FORMULA = "E = mc^2";
type View = "write" | "preview" | "split";
const VIEW_KEY = "hv_note_view";

/**
 * Write a Markdown note. Only the text by default; the eye shows the preview instead, the columns show both side by side
 * (wide panes only, the choice is remembered). Formulas in LaTeX ($…$), photos are uploaded and inserted. Used to create and to change notes.
 */
export function NoteEditor({ initial, groups, initialGroup, ideas, mode = "edit" }: { initial: NoteDraft; groups: Group[]; initialGroup: string | null; ideas: string[]; mode?: "edit" | "suggest" }) {
  const t = useTranslations("knowledge");
  const td = useTranslations("docrights.page");
  const tl = useTranslations("links");
  const tc = useTranslations("common");
  const router = useRouter();
  // Inside Ich the document opens next to its list, elsewhere on its own page.
  const here = usePathname();
  const docHref = (id: string) => (here.startsWith("/me/") ? `/me/notes/${id}` : `/links/${id}`);
  const editing = !!initial.id;
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [body, setBody] = useState(initial.body);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [groupId, setGroupId] = useState(groups.find((g) => g.slug === initialGroup)?.id ?? "");
  const [view, setView] = useState<View>("write");
  const [uploading, setUploading] = useState(0);
  const [changeNote, setChangeNote] = useState("");
  const [access, setAccess] = useState<Access>({ visibility: groups.some((g) => g.slug === initialGroup) ? "group" : "me", license: "cc_by_sa" });
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const suggesting = editing && mode === "suggest";
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const preview = useDeferredValue(body);
  const selectedGroup = groups.find((g) => g.id === groupId);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the remembered choice exists only in the browser
      if (saved === "split") setView("split");
    } catch { /* no storage */ }
  }, []);
  const choose = (v: View) => {
    const next = view === v ? "write" : v;
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next === "split" ? "split" : "write"); } catch { /* no storage */ }
  };

  // Editing a shared note: nobody else writes at the same time (a lock for five minutes, renewed while the page is open).
  useEffect(() => {
    if (!editing || suggesting) return;
    const id = initial.id!;
    let alive = true;
    const take = () => lockResource(id).then((res) => {
      if (!alive) return;
      if (!res.ok) setLockedBy(res.error === "locked" ? "?" : null); else setLockedBy(null);
    });
    take();
    const beat = setInterval(take, 60_000);
    return () => { alive = false; clearInterval(beat); void releaseResource(id); };
  }, [editing, suggesting, initial.id]);

  /** Puts Markdown around the selection (or a placeholder) and keeps the cursor useful. */
  const wrap = (before: string, after = "", placeholder = "") => {
    const el = area.current;
    if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const picked = body.slice(a, b) || placeholder;
    const next = body.slice(0, a) + before + picked + after + body.slice(b);
    if (next.length > MAX) return;
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + picked.length); });
  };
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
      const el = area.current;
      const at = el ? el.selectionEnd : body.length;
      setBody((b) => {
        const text = `${b.slice(0, at) && !b.slice(0, at).endsWith("\n") ? "\n" : ""}![${alt}](img:${res.path})\n`;
        return (b.slice(0, at) + text + b.slice(at)).slice(0, MAX);
      });
    }
  };
  const picker = useRef<HTMLInputElement>(null);

  const line = (prefix: string) => {
    const el = area.current;
    if (!el) return;
    const start = body.lastIndexOf("\n", el.selectionStart - 1) + 1;
    setBody(body.slice(0, start) + prefix + body.slice(start));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(el.selectionStart + prefix.length, el.selectionStart + prefix.length); });
  };

  const save = () => start(async () => {
    setError(null);
    if (suggesting) {
      const sent = await suggestChange(initial.id!, { title, description, body, note: changeNote });
      if (!sent.ok) return setError(t.has(`errors.${sent.error}`) ? t(`errors.${sent.error}` as "errors.invalid") : tc(`errors.${sent.error}` as "errors.unknown"));
      router.push(`${docHref(initial.id ?? "")}?suggested=1`);
      router.refresh();
      return;
    }
    const visibility = !editing ? access.visibility : undefined;
    const res = await saveNote({ id: initial.id, title, description, body, tags, groupId: groupId || null, note: changeNote, visibility, license: !editing && access.visibility === "public" ? access.license : undefined });
    if (!res.ok) return setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.invalid") : tc(`errors.${res.error}` as "errors.unknown"));
    router.push(docHref(res.data));
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      <label className={field.label}>{t("noteTitle")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field.input} />
      </label>

      {/* One tool row over both columns, the view buttons at its end; text and preview start and end at the same height. */}
      <div className="flex flex-col gap-2">
        <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-1">
          {view === "preview" ? <span className="text-sm font-bold">{t("preview")}</span> : <>
            <Tool label={t("heading")} onClick={() => line("## ")} />
            <Tool label={t("bold")} onClick={() => wrap("**", "**", t("bold"))} />
            <Tool label={t("italic")} onClick={() => wrap("_", "_", t("italic"))} />
            <Tool label={t("list")} onClick={() => line("- ")} />
            <Tool label={t("link")} onClick={() => wrap("[", "](https://)", t("link"))} />
            <Tool label={t("code")} onClick={() => wrap("`", "`", "code")} />
            <Tool label={t("table")} onClick={() => wrap("\n", "", TABLE.trimEnd())} />
            <Tool label={t("diagram")} onClick={() => wrap("\n", "", MERMAID.trimEnd())} />
            <Tool label={t("formula")} onClick={() => wrap("$$\n", "\n$$", FORMULA)} />
            <DrawingPicker t={t} onPick={(d) => wrap(`\n![${d.title.replace(/[[\]]/g, "")}](diagram:${d.id})\n`, "", "")} />
            <button type="button" onClick={() => picker.current?.click()} disabled={uploading > 0}
              className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface px-2.5 text-sm text-ink disabled:opacity-60">
              <IconImage size={16} /> {uploading > 0 ? t("imageUploading") : t("image")}
            </button>
            <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </>}
          <ViewButtons view={view} choose={choose} t={t} />
        </div>
        <div className={`grid gap-4 ${view === "split" ? "@4xl:grid-cols-2" : ""}`}>
          <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX} spellCheck aria-label={t("noteBody")} placeholder={t("notePlaceholder")}
            onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void addImages(files); } }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
            onDrop={(e) => { const files = [...e.dataTransfer.files]; if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void addImages(files); } }}
            className={`${field.textarea} h-full min-h-[320px] min-w-0 font-mono text-sm lg:min-h-[480px] ${view === "preview" ? "hidden" : ""}`} />
          <section aria-label={t("preview")} className={`min-h-[320px] min-w-0 border border-line bg-surface p-4 lg:min-h-[480px] ${view === "write" ? "hidden" : view === "split" ? "@max-4xl:hidden" : ""}`}>
            {preview.trim() ? <Markdown source={preview} /> : <p className="m-0 text-muted">{t("previewEmpty")}</p>}
          </section>
        </div>
        {view !== "preview" && <span className="text-xs text-muted">{body.length.toLocaleString("de-DE")} / {MAX.toLocaleString("de-DE")}</span>}
      </div>

      <label className={field.label}>{tl("descriptionLabel")}
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder={tl("descriptionPlaceholder")} className={field.textarea} />
      </label>
      <TagPicker label={tl("tagsLabel")} value={tags} onChange={setTags} suggestions={ideas} placeholder={tl("tagsPlaceholder")} max={10} />
      {lockedBy && <Notice tone="error">{td("locked")}</Notice>}
      {editing && (
        <label className={field.label}>{suggesting ? td("suggestNote") : td("changeNote")}
          <input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} maxLength={300} placeholder={td("changeNotePlaceholder")} className={field.input} />
        </label>
      )}
      {!editing && groups.length > 0 && (
        <label className={field.label}>{tl("groupLabel")}
          <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setAccess((a) => ({ ...a, visibility: e.target.value ? "group" : "me" })); }} className={`${field.select}`}>
            <option value="">{tl("everyone")}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{tl("inGroup", { name: g.name })}</option>)}
          </select>
        </label>
      )}
      {!editing && <AccessPicker value={access} onChange={setAccess} inGroup={!!selectedGroup} />}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending || title.trim().length < 3 || !body.trim() || (suggesting && changeNote.trim().length < 5) || (!!lockedBy && !suggesting)} onClick={save} className={btn.primary}>
          {pending ? t("saving") : suggesting ? td("suggestSend") : editing ? t("save") : t("publishNote")}
        </button>
        {editing && <button type="button" onClick={() => router.push(docHref(initial.id ?? ""))} className={btn.secondary}>{t("cancel")}</button>}
      </div>
    </div>
  );
}

/** Top right of the editor: the eye shows the preview instead of the text, the columns show both (only where there is room). */
function ViewButtons({ view, choose, t, className = "" }: { view: View; choose: (v: View) => void; t: (key: "showPreview" | "showSplit") => string; className?: string }) {
  const cls = (on: boolean) => `inline-flex h-9 w-9 items-center justify-center border ${on ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-ink"}`;
  return (
    <span className={`ml-auto flex gap-1 ${className}`}>
      <button type="button" aria-pressed={view === "preview"} aria-label={t("showPreview")} title={t("showPreview")} onClick={() => choose("preview")} className={cls(view === "preview")}><IconEye size={18} /></button>
      <button type="button" aria-pressed={view === "split"} aria-label={t("showSplit")} title={t("showSplit")} onClick={() => choose("split")} className={`${cls(view === "split")} @max-4xl:hidden`}><IconColumns size={18} /></button>
    </span>
  );
}

function Tool({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-9 items-center border border-line bg-surface px-2.5 text-sm text-ink">{label}</button>;
}

/** Puts a draw.io diagram from Ich → Diagramme into the text; the list loads when it opens. */
function DrawingPicker({ t, onPick }: { t: (key: "drawingInsert" | "drawingPick" | "drawingNone" | "drawingNew" | "drawingHint") => string; onPick: (d: { id: string; title: string }) => void }) {
  const [items, setItems] = useState<{ id: string; title: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = (now: boolean) => {
    setOpen(now);
    if (now) void readableDiagrams().then((res) => setItems(res.ok ? res.data : []));
  };
  return (
    <Popover label={t("drawingInsert")} ariaLabel={t("drawingPick")} open={open} onOpenChange={load} panelClassName="w-[320px]">
      <div className="flex flex-col" role="group" aria-label={t("drawingPick")}>
        {items === null ? <span className="py-2 text-sm text-muted">…</span>
          : items.length === 0 ? <span className="py-2 text-sm text-muted">{t("drawingNone")}</span>
          : items.map((d) => (
            <button key={d.id} type="button" onClick={() => { onPick(d); setOpen(false); }}
              className="flex h-10 items-center truncate border-0 border-b border-line bg-transparent px-0 text-left text-ink">{d.title}</button>
          ))}
        <a href="/me/diagrams/new" target="_blank" rel="noopener" className="flex h-10 items-center text-ink underline">{t("drawingNew")}</a>
        <span className="text-xs text-muted">{t("drawingHint")}</span>
      </div>
    </Popover>
  );
}
