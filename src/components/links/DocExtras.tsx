"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { commentOn, copyResource, decideSuggestion, deleteComment, restoreVersion } from "@/lib/actions/links";
import { relTime } from "@/lib/format";
import { btn, field } from "../ui/styles";
import { ConfirmAction } from "../ui/Action";

export type VersionRow = { version_no: number; note: string | null; editor: string | null; created_at: string };
export type SuggestionRow = { id: string; author: string; note: string; created_at: string; stale: boolean };
export type CommentRow = { id: string; author: string; author_id: string; body: string; created_at: string };

/** A copy in one's own Wissen (or a group's); it points back to the original. */
export function CopyButton({ id, groups, linkKey }: { id: string; groups: { id: string; name: string }[]; linkKey: string | null }) {
  const t = useTranslations("docrights.page");
  const tc = useTranslations("common");
  const [to, setTo] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.length > 0 && (
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("copyTo")} className={`${field.select} h-11`}>
          <option value="">{t("copyMine")}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
      <button type="button" disabled={pending} className={btn.secondary} onClick={() => start(async () => {
        const res = await copyResource(id, to || null, linkKey);
        if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
        setError(null); setDone(res.data);
      })}>{t("copy")}</button>
      {done && <Link href={`/links/${done}`} className="text-sm font-bold">{t("copied")} · {t("openCopy")}</Link>}
      {error && <span role="alert" className="text-sm font-bold">{error}</span>}
    </div>
  );
}

export function Versions({ id, versions, canRestore }: { id: string; versions: VersionRow[]; canRestore: boolean }) {
  const t = useTranslations("docrights.page");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <details className="border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">{t("versions")} ({versions.length})</summary>
      <ul className="m-0 mt-3 flex list-none flex-col p-0">
        {versions.map((v, i) => (
          <li key={v.version_no} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
            <span>{t("version", { n: v.version_no })} · {relTime(v.created_at, locale)}{v.editor ? ` · ${t("by", { name: v.editor })}` : ""}
              {v.note && v.note !== "created" ? ` · ${t("note", { note: v.note.replace(/^suggestion: |^restored:/, "") })}` : ""}</span>
            {canRestore && i > 0 && (
              <ConfirmAction disabled={pending} look={btn.linkMuted} question={t("restoreConfirm")} onConfirm={() => start(async () => { await restoreVersion(id, v.version_no); router.refresh(); })} label={t("restore")} />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Suggestions({ id, items }: { id: string; items: SuggestionRow[] }) {
  const t = useTranslations("docrights.page");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <section aria-label={t("suggestions")} className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
      <h2 className="m-0 text-xl font-bold">{t("suggestions")}</h2>
      {items.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 border-b border-line py-2">
          <span className="text-sm text-muted">{s.author} · {relTime(s.created_at, locale)}</span>
          <span>{s.note}</span>
          <span className="flex gap-2">
            <button type="button" disabled={pending} className={btn.primary} onClick={() => start(async () => {
              const res = await decideSuggestion(id, s.id, true);
              setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown")); router.refresh();
            })}>{t("accept")}</button>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => start(async () => { await decideSuggestion(id, s.id, false); router.refresh(); })}>{t("reject")}</button>
          </span>
        </div>
      ))}
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
    </section>
  );
}

export function Comments({ id, items, canComment, me, canModerate }: { id: string; items: CommentRow[]; canComment: boolean; me: string | null; canModerate: boolean }) {
  const t = useTranslations("docrights.page");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-label={t("comments")} className="flex flex-col gap-3">
      <h2 className="m-0 text-xl font-bold">{t("comments")}</h2>
      {items.length === 0 && <p className="m-0 text-muted">{t("noComments")}</p>}
      {items.map((c) => (
        <article key={c.id} className="flex flex-col gap-0.5 border-b border-line pb-2">
          <span className="text-sm text-muted">{c.author} · {relTime(c.created_at, locale)}</span>
          <p className="m-0 whitespace-pre-line">{c.body}</p>
          {(c.author_id === me || canModerate) && (
            <button type="button" disabled={pending} className={`${btn.linkMuted} self-start text-sm`} onClick={() => start(async () => { await deleteComment(id, c.id); router.refresh(); })}>{t("deleteComment")}</button>
          )}
        </article>
      ))}
      {canComment && (
        <form className="flex max-w-[640px] flex-col gap-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await commentOn(id, body);
            if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
            setBody(""); setError(null); router.refresh();
          });
        }}>
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={t("commentPlaceholder")} aria-label={t("commentPlaceholder")} className={field.textarea} />
          {error && <p role="alert" className="m-0 font-bold">{error}</p>}
          <button type="submit" disabled={pending || !body.trim()} className={`${btn.secondary} self-start`}>{t("commentSend")}</button>
        </form>
      )}
    </section>
  );
}
