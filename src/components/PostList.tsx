"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { PostView } from "@/lib/posts";
import { createPost, deletePost, votePost } from "@/lib/actions/posts";
import { relTime } from "@/lib/format";
import { Avatar } from "./ui/Avatar";
import { IconCheck, IconDown, IconReply, IconUp } from "./ui/Icons";
import { ReportButton } from "./ReportDialog";
import { btn, field } from "./ui/styles";

type Ctx = { groupId?: string; initiativeId?: string; regionId?: string };

export function Composer({ ctx, path, placeholder, viewerName, viewerSeed, viewerPath, onPosted }: {
  ctx: Ctx & { parentId?: string }; path: string; placeholder: string; viewerName?: string; viewerSeed?: number; viewerPath?: string | null; onPosted?: () => void;
}) {
  const tc = useTranslations("common");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    start(async () => {
      const res = await createPost({ ...ctx, body, path });
      if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
      setBody("");
      setError(null);
      onPosted?.();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {viewerName && <Avatar name={viewerName} seed={viewerSeed} path={viewerPath} size={36} />}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={body.length > 80 ? 3 : 1} aria-label={placeholder}
          placeholder={placeholder} className={`${field.textarea} min-h-11 flex-1 resize-y border-line py-2.5`} />
        <button type="submit" disabled={pending || !body.trim()} className={btn.primary}>{ctx.parentId ? tc("reply") : tc("post")}</button>
      </div>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
    </form>
  );
}

function Post({ p, path, canWrite, viewerId, compact }: { p: PostView; path: string; canWrite: boolean; viewerId?: string; compact?: boolean }) {
  const t = useTranslations("posts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [vote, setVote] = useOptimistic(p.my_vote);
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const score = p.score - p.my_vote + vote;
  const cast = (v: 1 | -1) => {
    if (!canWrite) return;
    const next = vote === v ? 0 : v;
    start(async () => { setVote(next); await votePost(p.id, next); });
  };
  const verified = p.author_mode === "real";
  return (
    <article className="flex gap-3 py-4">
      <Link href={`/profile/${p.author_id}`} aria-hidden="true" tabIndex={-1} className="flex-none">
        <Avatar name={p.author_name} seed={p.author_seed} path={p.author_path} size={compact ? 28 : 36} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <Link href={`/profile/${p.author_id}`} className="font-bold text-ink no-underline">{p.author_name}</Link>
          {verified ? <span className="inline-flex" title={tc("verified")} aria-label={tc("verified")}><IconCheck size={12} /></span> : <span className="text-muted">{tc("anonymous")}</span>}
          {p.author_region && <span className="text-muted">{p.author_region}</span>}
          <span className="text-muted">{relTime(p.created_at, locale)}</span>
          {p.is_pinned && <span className="font-bold">{t("pinned")}</span>}
        </div>
        <p className="m-0 whitespace-pre-line">{p.body}</p>
        {p.listing_id && (
          <Link href={`/${p.listing_kind === "offer" ? "offers" : "needs"}/${p.listing_id}`} className="flex flex-col gap-0.5 border border-ink bg-surface p-3 text-ink no-underline">
            <span className="text-xs font-bold">{p.listing_kind === "offer" ? t("offer") : t("need")}</span>
            <strong>{p.listing_title}</strong>
          </Link>
        )}
        {!compact && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <button type="button" aria-pressed={vote === 1} aria-label={tc("upvote")} onClick={() => cast(1)} disabled={!canWrite}
              className={`inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 ${vote === 1 ? "font-bold text-ink" : "text-muted"}`}>
              <IconUp /> <span className="tabular">{score}</span>
            </button>
            <button type="button" aria-pressed={vote === -1} aria-label={tc("downvote")} onClick={() => cast(-1)} disabled={!canWrite}
              className={`inline-flex h-9 items-center border-0 bg-transparent p-0 ${vote === -1 ? "text-ink" : "text-muted"}`}>
              <IconDown />
            </button>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
              className="inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-muted">
              <IconReply /> {tc("replies", { n: p.replies.length })}
            </button>
            {viewerId === p.author_id ? (
              <button type="button" onClick={() => start(async () => { await deletePost(p.id, path); })} className="border-0 bg-transparent p-0 text-muted underline">{tc("delete")}</button>
            ) : canWrite ? <ReportButton type="post" id={p.id} /> : null}
          </div>
        )}
        {open && (
          <div className="mt-1 flex flex-col border-l-2 border-line pl-4">
            {p.replies.map((r) => <Post key={r.id} p={r} path={path} canWrite={canWrite} viewerId={viewerId} compact />)}
            {canWrite && <Composer ctx={{ parentId: p.id }} path={path} placeholder={t("replyTo", { name: p.author_name })} />}
          </div>
        )}
      </div>
    </article>
  );
}

export function PostList({ posts, path, canWrite, viewerId, empty }: { posts: PostView[]; path: string; canWrite: boolean; viewerId?: string; empty?: string }) {
  if (!posts.length) return <p className="m-0 py-6 text-muted">{empty}</p>;
  return (
    <div className="flex flex-col divide-y divide-line">
      {posts.map((p) => <Post key={p.id} p={p} path={path} canWrite={canWrite} viewerId={viewerId} />)}
    </div>
  );
}
