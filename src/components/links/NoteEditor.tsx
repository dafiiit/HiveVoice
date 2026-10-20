"use client";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { lockResource, releaseResource, saveNote, suggestChange } from "@/lib/actions/links";
import { Markdown } from "../Markdown";
import { TagPicker } from "../TagPicker";
import { btn, field } from "../ui/styles";
import { AccessPicker, type Access } from "./AccessPicker";
import { Notice } from "@/components/ui/Page";

type Group = { id: string; slug: string; name: string };
export type NoteDraft = { id?: string; title: string; description: string; body: string; tags: string[] };

const MAX = 100_000;
const MERMAID = "```mermaid\nflowchart LR\n  A[Idee] --> B[Gruppe]\n  B --> C{Abstimmung}\n  C -->|Ja| D[Umsetzung]\n```\n";
const TABLE = "| Spalte A | Spalte B |\n| --- | --- |\n| Wert | Wert |\n";

/** Write a Markdown note with a live preview (side by side on wide screens, as two tabs on phones). Used to create and to change notes. */
export function NoteEditor({ initial, groups, initialGroup, ideas, mode = "edit" }: { initial: NoteDraft; groups: Group[]; initialGroup: string | null; ideas: string[]; mode?: "edit" | "suggest" }) {
  const t = useTranslations("knowledge");
  const td = useTranslations("docrights.page");
  const tl = useTranslations("links");
  const tc = useTranslations("common");
  const router = useRouter();
  const editing = !!initial.id;
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [body, setBody] = useState(initial.body);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [groupId, setGroupId] = useState(groups.find((g) => g.slug === initialGroup)?.id ?? "");
  const [view, setView] = useState<"write" | "preview">("write");
  const [changeNote, setChangeNote] = useState("");
  const [access, setAccess] = useState<Access>({ visibility: groups.some((g) => g.slug === initialGroup) ? "group" : "me", license: "cc_by_sa" });
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const suggesting = editing && mode === "suggest";
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const preview = useDeferredValue(body);
  const selectedGroup = groups.find((g) => g.id === groupId);

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
      router.push(`/links/${initial.id}?suggested=1`);
      router.refresh();
      return;
    }
    const visibility = !editing ? access.visibility : undefined;
    const res = await saveNote({ id: initial.id, title, description, body, tags, groupId: groupId || null, note: changeNote, visibility, license: !editing && access.visibility === "public" ? access.license : undefined });
    if (!res.ok) return setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.invalid") : tc(`errors.${res.error}` as "errors.unknown"));
    router.push(`/links/${res.data}`);
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      <label className={field.label}>{t("noteTitle")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field.input} />
      </label>

      <div role="tablist" aria-label={t("write")} className="flex border-b border-line lg:hidden">
        {(["write", "preview"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`inline-flex h-11 flex-1 items-center justify-center border-0 border-b-4 bg-transparent text-ink ${view === v ? "border-ink font-bold" : "border-transparent"}`}>{t(v)}</button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`flex min-w-0 flex-col gap-2 ${view === "write" ? "" : "max-lg:hidden"}`}>
          <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap gap-1">
            <Tool label={t("heading")} onClick={() => line("## ")} />
            <Tool label={t("bold")} onClick={() => wrap("**", "**", t("bold"))} />
            <Tool label={t("italic")} onClick={() => wrap("_", "_", t("italic"))} />
            <Tool label={t("list")} onClick={() => line("- ")} />
            <Tool label={t("link")} onClick={() => wrap("[", "](https://)", t("link"))} />
            <Tool label={t("code")} onClick={() => wrap("`", "`", "code")} />
            <Tool label={t("table")} onClick={() => wrap("\n", "", TABLE.trimEnd())} />
            <Tool label={t("diagram")} onClick={() => wrap("\n", "", MERMAID.trimEnd())} />
          </div>
          <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX} spellCheck aria-label={t("noteBody")} placeholder={t("notePlaceholder")}
            className={`${field.textarea} min-h-[320px] font-mono text-sm lg:min-h-[480px]`} />
          <span className="text-xs text-muted">{body.length.toLocaleString("de-DE")} / {MAX.toLocaleString("de-DE")}</span>
        </div>
        <section aria-label={t("preview")} className={`min-w-0 border border-line bg-surface p-4 ${view === "preview" ? "" : "max-lg:hidden"}`}>
          {preview.trim() ? <Markdown source={preview} /> : <p className="m-0 text-muted">{t("previewEmpty")}</p>}
        </section>
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
        {editing && <button type="button" onClick={() => router.push(`/links/${initial.id}`)} className={btn.secondary}>{t("cancel")}</button>}
      </div>
    </div>
  );
}

function Tool({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-9 items-center border border-line bg-surface px-2.5 text-sm text-ink">{label}</button>;
}
