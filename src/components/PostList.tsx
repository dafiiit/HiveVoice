"use client";
import { useState, useTransition } from "react";
import { useDraft } from "@/lib/drafts";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { PostView } from "@/lib/posts";
import { createPost, deletePost } from "@/lib/actions/posts";
import { sendOrQueue } from "@/lib/queue";
import { moderatePost } from "@/lib/actions/safety";
import { relTime } from "@/lib/format";
import { Avatar } from "./ui/Avatar";
import { IconCheck, IconDown, IconReply, IconUp } from "./ui/Icons";
import { Pop, Roll, usePulse } from "./ui/Vote";
import { ReportButton } from "./ReportDialog";
import { Attachments } from "./Attachments";
import { PollCard } from "./PollCard";
import { ExtrasButtons, ExtrasPreview, useExtras } from "./ComposerExtras";
import { btn, field } from "./ui/styles";
import { RefCardView } from "./refs/RefCardView";
import { Notice } from "@/components/ui/Page";

const press = "inline-flex h-9 items-center border-0 bg-transparent p-0 transition-transform duration-150 ease-out active:scale-90";

type Ctx = { groupId?: string; initiativeId?: string; regionId?: string };

export function Composer({ ctx, path, placeholder, viewerName, viewerSeed, viewerPath, onPosted }: {
  ctx: Ctx & { parentId?: string }; path: string; placeholder: string; viewerName?: string; viewerSeed?: number; viewerPath?: string | null; onPosted?: () => void;
}) {
  const tc = useTranslations("common");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const [pending, start] = useTransition();
  const x = useExtras();
  const reply = !!ctx.parentId;
  // The buttons (photo, poll, post) appear once one starts writing, so the empty composer stays one line.
  const [active, setActive] = useState(false);
  // A post begun but not sent stays on the device; it comes back with its buttons showing.
  useDraft(`post:${path}:${ctx.parentId ?? ""}`, body, (v) => { setBody(v); setActive(true); });
  const canSend = (!!body.trim() || x.has) && !x.blocked && !pending;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    start(async () => {
      // Text alone may wait on the device without a connection; photos, files and polls need the server right away.
      const res = x.has ? await createPost({ ...ctx, body, path, files: x.files, poll: x.poll }) : await sendOrQueue("post", { ...ctx, body, path });
      if (!res.ok) return setError(tc(`errors.${"error" in res && res.error ? res.error : "unknown"}` as "errors.unknown"));
      setBody("");
      x.clear();
      setError(null);
      setKept("queued" in res && !!res.queued);
      onPosted?.();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {viewerName && !reply && <Avatar name={viewerName} seed={viewerSeed} path={viewerPath} size={44} />}
        {/* One line it is exactly as high as a search field (44 px); it grows while writing. */}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} onFocus={() => setActive(true)} rows={reply ? 2 : body.length > 80 ? 3 : 1} aria-label={placeholder}
          placeholder={placeholder} className={`${field.textarea} ${reply ? "min-h-[4.5rem] py-2.5" : "h-11 min-h-11 py-[9px] leading-6 [&:not(:placeholder-shown)]:h-auto"} min-w-0 flex-1 resize-y border-line-strong`} />
      </div>
      <ExtrasPreview x={x} />
      {(reply || active || !!body || x.has) && (
        <div className={`flex items-center gap-1.5 ${viewerName && !reply ? "pl-12" : ""}`}>
          <ExtrasButtons x={x} size="sm" />
          <span className="flex-1" />
          <button type="submit" disabled={!canSend} className={btn.primary}>{reply ? tc("reply") : tc("post")}</button>
        </div>
      )}
      {error && <Notice tone="error" className="text-sm">{error}</Notice>}
      {kept && <Notice tone="hint">{tc("savedOffline")}</Notice>}
    </form>
  );
}

function Post({ p, path, canWrite, viewerId, compact, canModerate, startOpen = false }: { p: PostView; path: string; canWrite: boolean; viewerId?: string; compact?: boolean; canModerate?: boolean; startOpen?: boolean }) {
  const t = useTranslations("posts");
  const tc = useTranslations("common");
  const ts = useTranslations("safety");
  const locale = useLocale();
  // My vote shows at once and stays, also when it waits on the device for the connection.
  const [vote, setVote] = useState(p.my_vote);
  const [seenVote, setSeenVote] = useState(p.my_vote);
  if (p.my_vote !== seenVote) { setSeenVote(p.my_vote); setVote(p.my_vote); }
  const [, start] = useTransition();
  const [pulse, ping] = usePulse();
  const [open, setOpen] = useState(startOpen);
  const score = p.score - p.my_vote + vote;
  const cast = (v: 1 | -1) => {
    if (!canWrite) return;
    const next = vote === v ? 0 : v;
    ping(v, next !== 0);
    setVote(next);
    void sendOrQueue("vote", { postId: p.id, value: next, path });
  };
  const verified = p.author_mode === "real";
  if (p.removed) {
    return (
      <article className="flex flex-col gap-1 py-4 text-sm text-muted">
        <strong className="font-bold italic">{ts("post.removed")}</strong>
        {p.hidden_reason && <span>{ts("post.reason", { reason: p.hidden_reason })}</span>}
        {!compact && p.replies.length > 0 && (
          <div className="mt-1 flex flex-col border-l-2 border-line pl-4">
            {p.replies.map((r) => <Post key={r.id} p={r} path={path} canWrite={canWrite} viewerId={viewerId} compact canModerate={canModerate} />)}
          </div>
        )}
      </article>
    );
  }
  return (
    <article id={compact ? undefined : `post-${p.id}`} className="flex gap-3 py-4">
      {/* Like a thread: once the replies are open, a line runs down from the picture to them. */}
      <div className="flex flex-none flex-col items-center">
        <Link href={`/profile/${p.author_id}`} aria-hidden="true" tabIndex={-1} className="flex-none">
          <Avatar name={p.author_name} seed={p.author_seed} path={p.author_path} size={compact ? 28 : 36} />
        </Link>
        {open && !compact && <span aria-hidden="true" className="mt-2 w-0.5 flex-1 bg-line" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <Link href={`/profile/${p.author_id}`} className="font-bold text-ink no-underline">{p.author_name}</Link>
          {verified ? <span className="inline-flex" title={tc("verified")} aria-label={tc("verified")}><IconCheck size={12} /></span> : <span className="text-muted">{tc("anonymous")}</span>}
          {p.author_region && <span className="text-muted">{p.author_region}</span>}
          <span className="text-muted">{relTime(p.created_at, locale)}</span>
          {p.is_pinned && <span className="font-bold">{t("pinned")}</span>}
          {p.locked && <span className="text-muted">· {ts("post.locked")}</span>}
        </div>
        {p.body && <p className="m-0 whitespace-pre-line">{p.body}</p>}
        <Attachments items={p.attachments} />
        {p.poll && <PollCard poll={p.poll} canVote={canWrite} signedIn={!!viewerId} loginPath={path} />}
        <RefCardView card={p.ref} />
        {p.listing_id && (
          <Link href={`/listings/${p.listing_id}`} className="flex flex-col gap-0.5 border border-ink bg-surface p-3 text-ink no-underline">
            <span className="text-xs font-bold">{p.listing_kind === "offer" ? t("offer") : t("need")}</span>
            <strong>{p.listing_title}</strong>
          </Link>
        )}
        {!compact && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <button type="button" aria-pressed={vote === 1} aria-label={tc("upvote")} onClick={() => cast(1)} disabled={!canWrite}
              className={`${press} gap-1.5 ${vote === 1 ? "font-bold text-ink" : "text-muted"}`}>
              <Pop arrow={1} pulse={pulse}><IconUp /></Pop> <Roll value={score} />
            </button>
            <button type="button" aria-pressed={vote === -1} aria-label={tc("downvote")} onClick={() => cast(-1)} disabled={!canWrite}
              className={`${press} ${vote === -1 ? "text-ink" : "text-muted"}`}>
              <Pop arrow={-1} pulse={pulse}><IconDown /></Pop>
            </button>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
              className={`inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 ${open ? "text-ink" : "text-muted"}`}>
              <IconReply /> {tc("replies", { n: p.replies.length })}
            </button>
            {canModerate && <Moderation post={p} path={path} />}
            {viewerId === p.author_id ? (
              <button type="button" onClick={() => start(async () => { await deletePost(p.id, path); })} className={btn.linkMuted}>{tc("delete")}</button>
            ) : canWrite ? <ReportButton type="post" id={p.id} /> : null}
          </div>
        )}
        {open && (
          <div className="flex flex-col">
            {p.replies.map((r) => <Post key={r.id} p={r} path={path} canWrite={canWrite} viewerId={viewerId} compact canModerate={canModerate} />)}
            {canWrite && (!p.locked || canModerate) && <Composer ctx={{ parentId: p.id }} path={path} placeholder={t("replyTo", { name: p.author_name })} />}
          </div>
        )}
      </div>
    </article>
  );
}

/** Replies fold open under each post. `openId`: this post starts open (from a notification); `repliesOpen`: all do. */
export function PostList({ posts, path, canWrite, viewerId, empty, canModerate, openId, repliesOpen }: { posts: PostView[]; path: string; canWrite: boolean; viewerId?: string; empty?: string; canModerate?: boolean; openId?: string | null; repliesOpen?: boolean }) {
  if (!posts.length) return <p className="m-0 py-6 text-muted">{empty}</p>;
  return (
    <div className="flex flex-col divide-y divide-line">
      {posts.map((p) => <Post key={p.id} p={p} path={path} canWrite={canWrite} viewerId={viewerId} canModerate={canModerate} startOpen={repliesOpen || p.id === openId} />)}
    </div>
  );
}

/** Moderators of a group: take a post down (with a reason the author sees), pin it, or lock its comments. */
function Moderation({ post, path }: { post: PostView; path: string }) {
  const ts = useTranslations("safety.post");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: "remove" | "pin" | "unpin" | "lock" | "unlock") => start(async () => {
    const res = await moderatePost(post.id, action, reason, path);
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    if (res.ok) setAsking(false);
  });
  const link = "border-0 bg-transparent p-0 text-muted underline";
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" disabled={pending} className={link} onClick={() => run(post.is_pinned ? "unpin" : "pin")}>{post.is_pinned ? ts("unpin") : ts("pin")}</button>
      <button type="button" disabled={pending} className={link} onClick={() => run(post.locked ? "unlock" : "lock")}>{post.locked ? ts("unlock") : ts("lock")}</button>
      {!asking ? (
        <button type="button" className={link} onClick={() => setAsking(true)}>{ts("remove")}</button>
      ) : (
        <span className="flex w-full flex-wrap items-center gap-2">
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} aria-label={ts("reasonLabel")} placeholder={ts("reasonLabel")} className={`${field.input} min-w-0 flex-1`} />
          <button type="button" disabled={pending} className={`${btn.red}`} onClick={() => run("remove")}>{ts("remove")}</button>
        </span>
      )}
      {error && <span role="alert" className="font-bold">{error}</span>}
    </span>
  );
}
