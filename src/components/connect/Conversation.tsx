"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchMessages, sendMessage, type Message } from "@/lib/actions/messages";
import { cleanPoll, isImage, pollReady } from "@/lib/files";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";
import { IconClose } from "../ui/Icons";
import { ReportButton } from "../ReportDialog";
import { Attachments } from "../Attachments";
import { PollCard } from "../PollCard";
import { ExtrasButtons, ExtrasPreview, useExtras } from "../ComposerExtras";

// `key` stays the same when a sent message gets its real id, so its bubble is not rebuilt; `fresh` bubbles slide in.
type Local = Omit<Message, "created_at"> & { created_at: string | Date; sending?: boolean; key: string; fresh?: boolean };
type Quote = NonNullable<Message["reply_to"]>;
const ms = (d: string | Date) => new Date(d).getTime();
const dayKey = (d: string | Date) => new Date(d).toDateString();

export function Conversation({ id, initial, viewerId, otherName, otherReadAt: initialRead, verified }: {
  id: string; initial: Message[]; viewerId: string; otherName: string; otherReadAt: string | Date | null; verified: boolean;
}) {
  const t = useTranslations("connect");
  const te = useTranslations("extras");
  const locale = useLocale();
  const [messages, setMessages] = useState<Local[]>(() => initial.map((m) => ({ ...m, key: m.id })));
  const [readAt, setReadAt] = useState<string | Date | null>(initialRead);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Quote | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const x = useExtras();
  const list = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const field_ = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const seq = useRef(0);
  const arrived = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const settled = messages.filter((m) => !m.sending);
  const last = settled[settled.length - 1]?.created_at;

  // Polling keeps the setup portable: no realtime service needed.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetchMessages(id, new Date(last ?? 0).toISOString());
      if (!res.ok) return;
      setReadAt(res.data.otherReadAt);
      if (res.data.messages.length) setMessages((m) => [...m, ...res.data.messages.filter((y) => !m.some((z) => z.id === y.id)).map((y) => ({ ...y, key: y.id, fresh: true }))]);
    };
    const h = setInterval(tick, 4000);
    return () => clearInterval(h);
  }, [id, last]);

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

  const send = async () => {
    const body = draft.trim();
    const poll = x.poll && pollReady(x.poll) ? cleanPoll(x.poll) : null;
    if ((!body && !x.files.length && !poll) || x.blocked) return;
    const tmp = `tmp-${++seq.current}`;
    const files = x.files, rawPoll = x.poll, quote = replyTo;
    setDraft("");
    setError(null);
    x.clear();
    setReplyTo(null);
    stick.current = true;
    setMessages((m) => [...m, { id: tmp, key: tmp, fresh: true, body, created_at: new Date(), sender_id: viewerId, sender_name: "", sender_seed: 0, sender_path: null, sending: true, reply_to: quote, attachments: [], poll: null }]);
    const res = await sendMessage({ conversationId: id, body, replyToId: quote?.id ?? null, files, poll });
    if (res.ok) {
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
        className="flex max-h-[55dvh] min-h-[280px] flex-1 flex-col gap-1 overflow-y-auto py-3 max-md:max-h-none max-md:min-h-0 lg:max-h-none lg:min-h-0 md:py-4">
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
                  {(m.body || m.reply_to) && (
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
                  <Attachments items={m.attachments} align={mine ? "end" : "start"} />
                  {m.poll && (
                    <PollCard poll={m.poll} canVote={verified} signedIn loginPath="/connect"
                      onChange={(p) => setMessages((all) => all.map((y) => (y.id === m.id ? { ...y, poll: p } : y)))} />
                  )}
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {m.sending ? t("sending") : fmt.time.format(new Date(m.created_at))}
                    {mine && lastMine?.id === m.id && readAt && ms(readAt) >= ms(m.created_at) - 1000 && <span>· {t("read")}</span>}
                    {!m.sending && <button type="button" onClick={() => startReply(m)} className="border-0 bg-transparent p-0 text-xs text-muted underline">{te("reply")}</button>}
                    {!mine && !m.sending && <ReportButton type="message" id={m.id} className="border-0 bg-transparent p-0 text-xs text-muted underline" />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
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
