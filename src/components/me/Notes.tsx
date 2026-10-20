"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { deleteNote, saveNote } from "@/lib/actions/settings";
import { relTime } from "@/lib/format";
import { IconLock } from "../ui/Icons";
import { btn, field } from "../ui/styles";

export function Notes({ notes }: { notes: { id: string; body: string; updated_at: string }[] }) {
  const t = useTranslations("me.notes");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <span className="flex items-center gap-2 text-sm"><IconLock /> {t("private")}</span>
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) start(async () => { await saveNote(null, draft); setDraft(""); }); }}>
        <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("placeholder")} aria-label={t("new")} className={field.textarea} />
        <button type="submit" disabled={pending || !draft.trim()} className={`${btn.primary} self-start`}>{t("add")}</button>
      </form>
      {notes.length === 0 && <p className="m-0 text-muted">{t("empty")}</p>}
      {notes.map((n) => (
        <article key={n.id} className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-sm text-muted">{t("note")} · {relTime(n.updated_at, locale)}</span>
          {editing === n.id ? (
            <>
              <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className={field.textarea} />
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => start(async () => { await saveNote(n.id, text); setEditing(null); })} className={btn.primary}>{tc("save")}</button>
                <button type="button" onClick={() => setEditing(null)} className={btn.secondary}>{tc("cancel")}</button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 whitespace-pre-line">{n.body}</p>
              <div className="flex gap-3 text-sm">
                <button type="button" onClick={() => { setEditing(n.id); setText(n.body); }} className={btn.linkMuted}>{tc("edit")}</button>
                <button type="button" disabled={pending} onClick={() => start(async () => { await deleteNote(n.id); })} className={btn.linkMuted}>{tc("delete")}</button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
