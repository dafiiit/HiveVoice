"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchMessages, sendMessage, type Message } from "@/lib/actions/messages";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";
import { ReportButton } from "../ReportDialog";

// `key` stays the same when a sent message gets its real id, so its bubble is not rebuilt; `fresh` bubbles slide in.
type Local = Omit<Message, "created_at"> & { created_at: string | Date; sending?: boolean; key: string; fresh?: boolean };
const ms = (d: string | Date) => new Date(d).getTime();
const dayKey = (d: string | Date) => new Date(d).toDateString();

export function Conversation({ id, initial, viewerId, otherName, otherReadAt: initialRead }: {
  id: string; initial: Message[]; viewerId: string; otherName: string; otherReadAt: string | Date | null;
}) {
  const t = useTranslations("connect");
  const locale = useLocale();
  const [messages, setMessages] = useState<Local[]>(() => initial.map((m) => ({ ...m, key: m.id })));
  const [readAt, setReadAt] = useState<string | Date | null>(initialRead);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field_ = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const seq = useRef(0);
  const arrived = useRef(false);
  const settled = messages.filter((m) => !m.sending);
  const last = settled[settled.length - 1]?.created_at;

  // Polling keeps the setup portable: no realtime service needed.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetchMessages(id, new Date(last ?? 0).toISOString());
      if (!res.ok) return;
      setReadAt(res.data.otherReadAt);
      if (res.data.messages.length) setMessages((m) => [...m, ...res.data.messages.filter((x) => !m.some((y) => y.id === x.id)).map((x) => ({ ...x, key: x.id, fresh: true }))]);
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

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    const tmp = `tmp-${++seq.current}`;
    setDraft("");
    setError(null);
    stick.current = true;
    setMessages((m) => [...m, { id: tmp, key: tmp, fresh: true, body, created_at: new Date(), sender_id: viewerId, sender_name: "", sender_seed: 0, sender_path: null, sending: true }]);
    const res = await sendMessage(id, body);
    if (res.ok) {
      setMessages((m) => m.some((x) => x.id === res.data.id)
        ? m.filter((x) => x.id !== tmp)
        : m.map((x) => (x.id === tmp ? { ...res.data, key: tmp, fresh: true } : x)));
    } else {
      setMessages((m) => m.filter((x) => x.id !== tmp));
      setDraft(body);
      setError(t("sendFailed"));
    }
    field_.current?.focus();
  };

  const lastMine = [...messages].reverse().find((m) => m.sender_id === viewerId && !m.sending);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} aria-live="polite" role="log"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="flex max-h-[55dvh] min-h-[280px] flex-1 flex-col gap-1 overflow-y-auto py-3 max-md:max-h-none max-md:min-h-0 lg:max-h-none lg:min-h-0 md:py-4">
        {messages.map((m, i) => {
          const mine = m.sender_id === viewerId;
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const cluster = !newDay && prev.sender_id === m.sender_id && ms(m.created_at) - ms(prev.created_at) < 5 * 60000;
          return (
            <div key={m.key} className={cluster ? "" : "mt-3 first:mt-0"}>
              {newDay && <div className="my-3 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{dayLabel(m.created_at)}<span className="h-px flex-1 bg-line" /></div>}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (cluster ? <span className="w-7 flex-none" /> : <Avatar name={m.sender_name} seed={m.sender_seed} path={m.sender_path} size={28} />)}
                <div style={{ "--ox": mine ? "100%" : "0%" } as CSSProperties} className={`flex max-w-[78%] flex-col gap-0.5 ${m.fresh ? "bubble-in" : ""} ${mine ? "items-end" : "items-start"}`}>
                  <span className={`whitespace-pre-line break-words px-3.5 py-2.5 ${mine ? "bg-ink text-on-ink" : "border border-line bg-surface text-ink"} transition-opacity duration-300 ${m.sending ? "opacity-60" : ""}`}>{m.body}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {m.sending ? t("sending") : fmt.time.format(new Date(m.created_at))}
                    {mine && lastMine?.id === m.id && readAt && ms(readAt) >= ms(m.created_at) - 1000 && <span>· {t("read")}</span>}
                    {!mine && !m.sending && <ReportButton type="message" id={m.id} className="border-0 bg-transparent p-0 text-xs text-muted underline" />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-line pt-3">
        <textarea ref={field_} value={draft} rows={Math.min(5, Math.max(1, draft.split("\n").length))} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          placeholder={t("messageTo", { name: otherName })} aria-label={t("write")} maxLength={5000}
          className={`${field.textarea} min-h-11 flex-1 resize-none border-line py-2.5`} />
        <button type="submit" disabled={!draft.trim()} className={btn.primary}>{t("send")}</button>
      </form>
    </div>
  );
}
