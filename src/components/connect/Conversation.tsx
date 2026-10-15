"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchMessages, sendMessage, type Message } from "@/lib/actions/messages";
import { relTime } from "@/lib/format";
import { btn, field } from "../ui/styles";
import { ReportButton } from "../ReportDialog";

export function Conversation({ id, initial, viewerId, otherName }: { id: string; initial: Message[]; viewerId: string; otherName: string }) {
  const t = useTranslations("connect");
  const locale = useLocale();
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1]?.created_at ?? new Date(0).toISOString();

  // Polling keeps the setup portable: no realtime service needed.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetchMessages(id, last);
      if (res.ok && res.data.length) setMessages((m) => [...m, ...res.data.filter((x) => !m.some((y) => y.id === x.id))]);
    };
    const h = setInterval(tick, 4000);
    return () => clearInterval(h);
  }, [id, last]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const body = draft;
    setDraft("");
    start(async () => {
      const res = await sendMessage(id, body);
      if (res.ok) setMessages((m) => [...m, res.data]);
      else setDraft(body);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto py-4" aria-live="polite">
        {messages.map((m) => {
          const mine = m.sender_id === viewerId;
          return (
            <div key={m.id} className={`flex max-w-[78%] flex-col gap-1 px-3.5 py-2.5 ${mine ? "self-end bg-paper" : "self-start border border-line bg-surface"}`}>
              <span className="text-xs text-muted">{mine ? t("you") : m.sender_name} · {relTime(m.created_at, locale)}</span>
              <span className="whitespace-pre-line">{m.body}</span>
              {!mine && <ReportButton type="message" id={m.id} className="self-start border-0 bg-transparent p-0 text-xs text-muted underline" />}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line pt-3">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("messageTo", { name: otherName })} aria-label={t("write")} className={field.inputSm} />
        <button type="submit" disabled={pending || !draft.trim()} className={btn.primary}>{t("send")}</button>
      </form>
    </div>
  );
}
