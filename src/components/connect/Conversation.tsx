"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useDraft } from "@/lib/drafts";
import { useLocale, useTranslations } from "next-intl";
import { fetchMessages, sendMessage, type Message } from "@/lib/actions/messages";
import { OUTBOX_EVENT, enqueue, flushOutbox, offline, queued, type OutboxDetail } from "@/lib/outbox";
import { deleteMessage, editMessage } from "@/lib/actions/safety";
import { cleanPoll, isImage, pollReady } from "@/lib/files";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";
import { IconClose } from "../ui/Icons";
import { ReportButton } from "../ReportDialog";
import { Attachments } from "../Attachments";
import { PollCard } from "../PollCard";
import { RefCardView } from "../refs/RefCardView";
import { ExtrasButtons, ExtrasPreview, useExtras } from "../ComposerExtras";
import { Notice } from "@/components/ui/Page";

// `key` stays the same when a sent message gets its real id, so its bubble is not rebuilt; `fresh` bubbles slide in.
type Local = Omit<Message, "created_at"> & { created_at: string | Date; sending?: boolean; waiting?: boolean; key: string; fresh?: boolean };
type Quote = NonNullable<Message["reply_to"]>;
const ms = (d: string | Date) => new Date(d).getTime();
const dayKey = (d: string | Date) => new Date(d).toDateString();

/** What came back from the server replaces what is shown (edits, deletions, new votes), and unknown messages are added. */
function merge(shown: Local[], incoming: Message[]): Local[] {
  const next = shown.map((x) => { const y = incoming.find((z) => z.id === x.id); return y ? { ...x, ...y, key: x.key, fresh: x.fresh } : x; });
  return [...next, ...incoming.filter((y) => !shown.some((x) => x.id === y.id)).map((y) => ({ ...y, key: y.id, fresh: true }))];
}

export function Conversation({ id, initial, viewerId, otherName, otherReadAt: initialRead, verified, asOf: initialAsOf }: {
  id: string; initial: Message[]; viewerId: string; otherName: string; otherReadAt: string | Date | null; verified: boolean; asOf: string;
}) {
  const t = useTranslations("connect");
  const te = useTranslations("extras");
  const ts = useTranslations("safety.message");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [messages, setMessages] = useState<Local[]>(() => initial.map((m) => ({ ...m, key: m.id })));
  const [readAt, setReadAt] = useState<string | Date | null>(initialRead);
  const [draft, setDraft] = useState("");
  // A message begun but not sent stays on the device (an empty field after sending leaves nothing behind).
  useDraft(`chat:${id}`, draft, setDraft);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Quote | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const x = useExtras();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const asOf = useRef(initialAsOf);
  const list = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const field_ = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const arrived = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // Polling keeps the setup portable: no realtime service needed. The server clock of the last answer marks "what is new".
  // It asks every 4 s while the conversation is alive (something arrived or was typed in the last two minutes), then
  // less often, so that a chat left open on a desk does not keep a phone's radio busy.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const wait = () => { const idle = Date.now() - last; return idle < 120_000 ? 4000 : idle < 600_000 ? 12_000 : 30_000; };
    const tick = async () => {
      if (document.visibilityState === "visible" && !offline()) {
        const res = await fetchMessages(id, new Date(new Date(asOf.current).getTime() - 2000).toISOString()).catch(() => null);
        if (res?.ok) {
          asOf.current = res.data.asOf;
          setReadAt(res.data.otherReadAt);
          if (res.data.messages.length) { last = Date.now(); setMessages((m) => merge(m, res.data.messages)); }
        }
      }
      if (alive) timer = setTimeout(tick, wait());
    };
    timer = setTimeout(tick, wait());
    document.addEventListener("keydown", bump);
    document.addEventListener("pointerdown", bump);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("keydown", bump); document.removeEventListener("pointerdown", bump); };
  }, [id]);

  // Written without a connection: shown as waiting, sent by the outbox once the connection is back.
  useEffect(() => {
    // The device's storage is only readable after hydration, so the waiting messages join one tick later.
    const show = setTimeout(() => {
      const waiting = queued(id);
      if (waiting.length) setMessages((m) => [...m, ...waiting.filter((q) => !m.some((y) => y.key === q.key)).map((q): Local => ({
        id: q.key, key: q.key, body: q.body, created_at: q.at, sender_id: viewerId, sender_name: "", sender_seed: 0, sender_path: null,
        sending: true, waiting: true, reply_to: null, attachments: [], poll: null, ref: null, edited_at: null, deleted_at: null,
      }))]);
    }, 0);
    const onSent = (e: Event) => {
      const d = (e as CustomEvent<OutboxDetail>).detail;
      if (d.conversationId !== id) return;
      if (d.failed) { setMessages((m) => m.filter((y) => y.key !== d.key)); setError(t("sendFailed")); return; }
      const sent = d.message!;
      setMessages((m) => m.some((y) => y.id === sent.id) ? m.filter((y) => y.key !== d.key) : m.map((y) => (y.key === d.key ? { ...sent, key: d.key } : y)));
    };
    window.addEventListener(OUTBOX_EVENT, onSent);
    void flushOutbox();
    return () => { clearTimeout(show); window.removeEventListener(OUTBOX_EVENT, onSent); };
  }, [id, viewerId, t]);

  // The "edit" link disappears 15 minutes after sending.
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, []);

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) {
      const calm = !arrived.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ top: el.scrollHeight, behavior: calm ? "auto" : "smooth" });
    }
    arrived.current = true;
  }, [messages.length]);

  // Photos and polls grow after they appear: while the reader sits at the bottom, the bottom stays in view.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const watch = new ResizeObserver(() => { const box = list.current; if (box && stick.current) box.scrollTop = box.scrollHeight; });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const fmt = useMemo(() => ({
    time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    day: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }),
  }), [locale]);
  const dayLabel = useCallback((d: string | Date) => {
    const now = new Date();
    if (dayKey(d) === now.toDateString()) return t("today");
    if (dayKey(d) === new Date(now.getTime() - 86400000).toDateString()) return t("yesterday");
    return fmt.day.format(new Date(d));
  }, [fmt, t]);

  const nameOf = (q: Quote) => (q.sender_id === viewerId ? te("you") : q.sender_name);
  const quoteText = (q: Quote) => q.body || te(q.kind === "photo" ? "photo" : q.kind === "poll" ? "poll" : "file");
  const startReply = (m: Local) => {
    setReplyTo({
      id: m.id, sender_id: m.sender_id, sender_name: m.sender_name, body: m.body.slice(0, 200),
      kind: m.body ? "text" : m.attachments.some((a) => isImage(a.mime)) ? "photo" : m.attachments.length ? "file" : m.poll ? "poll" : "text",
    });
    field_.current?.focus();
  };
  const jump = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    stick.current = false;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setFlash(messageId);
    setTimeout(() => setFlash((f) => (f === messageId ? null : f)), 1500);
  };

  const saveEdit = async () => {
    const e = editing;
    if (!e) return;
    const res = await editMessage(id, e.id, e.text);
    if (res.ok) { setMessages((m) => merge(m, [res.data])); setEditing(null); setError(null); }
    else setError(tc(`errors.${res.error}` as "errors.unknown"));
  };
  const remove = async (messageId: string, forAll: boolean) => {
    const res = await deleteMessage(id, messageId, forAll);
    setDeleting(null);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    if (forAll && res.data) setMessages((m) => merge(m, [res.data!]));
    else setMessages((m) => m.filter((y) => y.id !== messageId));
  };

  const send = async () => {
    const body = draft.trim();
    const poll = x.poll && pollReady(x.poll) ? cleanPoll(x.poll) : null;
    if ((!body && !x.files.length && !poll) || x.blocked) return;
    if (offline() && (x.files.length || poll)) { setError(t("offlineExtras")); return; }
    const tmp = crypto.randomUUID();
    const files = x.files, rawPoll = x.poll, quote = replyTo;
    setDraft("");
    setError(null);
    x.clear();
    setReplyTo(null);
    stick.current = true;
    const at = new Date();
    setMessages((m) => [...m, { id: tmp, key: tmp, fresh: true, body, created_at: at, sender_id: viewerId, sender_name: "", sender_seed: 0, sender_path: null, sending: true, reply_to: quote, attachments: [], poll: null, ref: null, edited_at: null, deleted_at: null }]);
    // No connection (or it breaks while sending): text waits on the device and goes out later.
    const wait = () => {
      enqueue({ key: tmp, conversationId: id, body, replyToId: quote?.id ?? null, at: at.toISOString() });
      setMessages((m) => m.map((y) => (y.key === tmp ? { ...y, waiting: true } : y)));
    };
    if (offline() && !files.length && !poll) { wait(); return; }
    const res = await sendMessage({ conversationId: id, body, replyToId: quote?.id ?? null, files, poll, clientKey: tmp }).catch(() => null);
    if (!res && !files.length && !poll) { wait(); return; }
    if (res?.ok) {
      setMessages((m) => m.some((y) => y.id === res.data.id)
        ? m.filter((y) => y.id !== tmp)
        : m.map((y) => (y.id === tmp ? { ...res.data, key: tmp, fresh: true } : y)));
    } else {
      setMessages((m) => m.filter((y) => y.id !== tmp));
      setDraft(body);
      x.restore(files, rawPoll);
      setReplyTo(quote);
      setError(t("sendFailed"));
    }
    field_.current?.focus();
  };

  const lastMine = [...messages].reverse().find((m) => m.sender_id === viewerId && !m.sending);
  const canSend = (!!draft.trim() || x.has) && !x.blocked;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} aria-live="polite" role="log"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3 md:py-4">
        <div ref={inner} className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const mine = m.sender_id === viewerId;
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const cluster = !newDay && prev.sender_id === m.sender_id && ms(m.created_at) - ms(prev.created_at) < 5 * 60000;
          return (
            <div key={m.key} id={`msg-${m.id}`} className={`${cluster ? "" : "mt-3 first:mt-0"} ${flash === m.id ? "flash" : ""}`}
              onTouchStart={(e) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const s = swipe.current; swipe.current = null;
                if (!s || m.sending) return;
                const dx = e.changedTouches[0].clientX - s.x, dy = Math.abs(e.changedTouches[0].clientY - s.y);
                if (dx > 80 && dy < 25) startReply(m);
              }}>
              {newDay && <div className="my-3 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{dayLabel(m.created_at)}<span className="h-px flex-1 bg-line" /></div>}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (cluster ? <span className="w-7 flex-none" /> : <Avatar name={m.sender_name} seed={m.sender_seed} path={m.sender_path} size={28} />)}
                <div style={{ "--ox": mine ? "100%" : "0%" } as CSSProperties} className={`flex max-w-[82%] min-w-0 flex-col gap-1 ${m.fresh ? "bubble-in" : ""} ${mine ? "items-end" : "items-start"}`}>
                  {m.deleted_at && (
                    <span className="border border-dashed border-line px-3.5 py-2 text-sm italic text-muted">{ts("deleted")}</span>
                  )}
                  {editing?.id === m.id && (
                    <div className="flex w-full min-w-[240px] flex-col gap-1.5">
                      <textarea value={editing.text} rows={3} maxLength={5000} aria-label={ts("editLabel")} autoFocus onChange={(e) => setEditing({ id: m.id, text: e.target.value })} className={`${field.textarea} min-h-16 resize-y border-line py-2`} />
                      <span className="flex gap-2">
                        <button type="button" onClick={() => void saveEdit()} className={btn.primarySm}>{ts("save")}</button>
                        <button type="button" onClick={() => setEditing(null)} className={btn.secondarySm}>{ts("cancel")}</button>
                      </span>
                    </div>
                  )}
                  {!m.deleted_at && editing?.id !== m.id && (m.body || m.reply_to) && (
                    <div className={`flex min-w-0 flex-col gap-1.5 px-3.5 py-2.5 transition-opacity duration-300 ${mine ? "bg-ink text-on-ink" : "border border-line bg-surface text-ink"} ${m.sending ? "opacity-60" : ""}`}>
                      {m.reply_to && (
                        <button type="button" onClick={() => jump(m.reply_to!.id)} aria-label={te("goToOriginal")}
                          className={`flex min-w-0 flex-col border-0 border-l-[3px] bg-transparent py-0.5 pl-2.5 pr-0 text-left text-inherit ${mine ? "border-on-ink/70" : "border-ink"}`}>
                          <span className="text-xs font-bold">{nameOf(m.reply_to)}</span>
                          <span className="line-clamp-2 break-words text-sm opacity-80">{quoteText(m.reply_to)}</span>
                        </button>
                      )}
                      {m.body && <span className="whitespace-pre-line break-words">{m.body}</span>}
                    </div>
                  )}
                  {!m.deleted_at && m.ref && <div className={`w-full max-w-[360px] ${mine ? "self-end" : "self-start"}`}><RefCardView card={m.ref} /></div>}
                  <Attachments items={m.attachments} align={mine ? "end" : "start"} />
                  {m.poll && (
                    <PollCard poll={m.poll} canVote={verified} signedIn loginPath="/friends"
                      onChange={(p) => setMessages((all) => all.map((y) => (y.id === m.id ? { ...y, poll: p } : y)))} />
                  )}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    {m.waiting ? t("waiting") : m.sending ? t("sending") : fmt.time.format(new Date(m.created_at))}
                    {m.edited_at && !m.deleted_at && <span>· {ts("edited")}</span>}
                    {mine && lastMine?.id === m.id && readAt && ms(readAt) >= ms(m.created_at) - 1000 && <span>· {t("read")}</span>}
                    {!m.sending && !m.deleted_at && <button type="button" onClick={() => startReply(m)} className={`${btn.linkMuted} text-xs`}>{te("reply")}</button>}
                    {mine && !m.sending && !m.deleted_at && now - ms(m.created_at) < 15 * 60000 && editing?.id !== m.id && (
                      <button type="button" onClick={() => setEditing({ id: m.id, text: m.body })} className={`${btn.linkMuted} text-xs`}>{ts("edit")}</button>
                    )}
                    {/* Own messages can be deleted (for me or for everyone); someone else's can only be hidden for me. */}
                    {mine && !m.sending && !m.deleted_at && deleting !== m.id && (
                      <button type="button" onClick={() => setDeleting(m.id)} className={`${btn.linkMuted} text-xs`}>{ts("delete")}</button>
                    )}
                    {!mine && !m.sending && !m.deleted_at && (
                      <button type="button" onClick={() => void remove(m.id, false)} className={`${btn.linkMuted} text-xs`}>{ts("hide")}</button>
                    )}
                    {deleting === m.id && (
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => void remove(m.id, false)} className={`${btn.link} text-xs font-bold`}>{ts("deleteForMe")}</button>
                        {mine && <button type="button" onClick={() => void remove(m.id, true)} className={`${btn.link} text-xs font-bold`}>{ts("deleteForAll")}</button>}
                        <button type="button" onClick={() => setDeleting(null)} className={`${btn.linkMuted} text-xs`}>{ts("cancel")}</button>
                      </span>
                    )}
                    {!mine && !m.sending && !m.deleted_at && <ReportButton type="message" id={m.id} className={`${btn.linkMuted} text-xs`} />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
      {error && <Notice tone="error" className="text-sm">{error}</Notice>}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex flex-none flex-col gap-2 border-t border-line pt-2 md:pt-3">
        {replyTo && (
          <div className="flex items-start gap-2 border-l-[3px] border-ink bg-chip py-1.5 pl-3 pr-1">
            <div className="flex min-w-0 flex-1 flex-col"><span className="text-xs font-bold">{te("replyingTo", { name: nameOf(replyTo) })}</span><span className="truncate text-sm">{quoteText(replyTo)}</span></div>
            <button type="button" aria-label={te("cancelReply")} onClick={() => setReplyTo(null)} className="inline-flex h-9 w-9 flex-none items-center justify-center border-0 bg-transparent p-0 text-ink"><IconClose size={16} /></button>
          </div>
        )}
        <ExtrasPreview x={x} />
        <div className="flex items-end gap-1.5">
          <ExtrasButtons x={x} size="sm" />
          <textarea ref={field_} value={draft} rows={Math.min(5, Math.max(1, draft.split("\n").length))} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
            placeholder={t("messageTo", { name: otherName })} aria-label={t("write")} maxLength={5000}
            className={`${field.textarea} min-h-10 min-w-0 flex-1 resize-none border-line py-2 md:min-h-11 md:py-2.5`} />
          <button type="submit" disabled={!canSend} className={`${btn.primary} flex-none max-md:px-3`}>{t("send")}</button>
        </div>
      </form>
    </div>
  );
}
