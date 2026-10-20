"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { shareTargets, shareToChat, shareToGroup, shareToMarket, type ShareTargets } from "@/lib/actions/share";
import type { RefType } from "@/lib/refs";
import { IconCheck } from "../ui/Icons";
import { ShareButtons } from "../ShareButtons";
import { btn, chip, field } from "../ui/styles";

type Where = "chat" | "group" | "market" | "out";

/**
 * "Weitergeben": send something as a card into a chat, a group (its collection, optionally its talk) or the
 * marketplace of one's place. Works the same for offers, requests, documents, groups, tasks and initiatives.
 * Public things can also leave HiveVoice: share sheet, link and QR code (`external`).
 */
export function ShareMenu({ type, id, title, className, external }: { type: RefType; id: string; title: string; className?: string; external?: { url: string; text: string } }) {
  const t = useTranslations("refs.share");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ShareTargets | null>(null);
  const [where, setWhere] = useState<Where>("chat");
  const [target, setTarget] = useState("");
  const [asPost, setAsPost] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => {
    setOpen(true); setDone(null); setError(null);
    if (!targets) start(async () => {
      const res = await shareTargets();
      if (res.ok) { setTargets(res.data); setTarget(res.data.chats[0]?.id ?? ""); }
      else setError(tc(`errors.${res.error}` as "errors.unknown"));
    });
  };
  const pick = (w: Where) => {
    setWhere(w); setDone(null);
    setTarget(w === "chat" ? targets?.chats[0]?.id ?? "" : w === "group" ? targets?.groups[0]?.id ?? "" : targets?.market?.regionId ?? "");
  };
  const send = () => start(async () => {
    setError(null);
    const ref = { type, id };
    const res = where === "chat" ? await shareToChat(target, ref, note)
      : where === "group" ? await shareToGroup(target, ref, note, asPost)
      : await shareToMarket(target, ref, note);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    const group = targets?.groups.find((g) => g.id === target);
    setDone(where === "chat" ? t("sent") : where === "group" ? t("added", { name: group?.name ?? "" }) : t("posted"));
    setNote("");
  });

  const options = where === "chat" ? (targets?.chats ?? []).map((c) => ({ id: c.id, label: c.title }))
    : where === "group" ? (targets?.groups ?? []).map((g) => ({ id: g.id, label: g.name })) : [];
  const empty = where === "chat" ? t("chatEmpty") : where === "group" ? t("groupEmpty") : t("marketNone");
  const ready = !!target && (where !== "market" || !!targets?.market);

  return (
    <>
      <button type="button" onClick={show} className={className ?? btn.secondary}>{t("button")}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("title", { title })} onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-[520px] flex-col gap-4 overflow-y-auto bg-surface p-6">
            <strong className="text-lg leading-tight">{t("title", { title })}</strong>
            <div role="radiogroup" aria-label={t("button")} className="flex flex-wrap gap-2">
              {(external ? ["chat", "group", "market", "out"] as const : ["chat", "group", "market"] as const).map((w) => (
                <button key={w} type="button" role="radio" aria-checked={where === w} onClick={() => pick(w)} className={chip(where === w)}>{t(w)}</button>
              ))}
            </div>
            {where === "out" && external && <ShareButtons url={external.url} title={title} text={external.text} />}
            {where !== "out" && <>
            {targets && where !== "market" && (options.length === 0
              ? <p className="m-0 text-sm text-muted">{empty}</p>
              : <label className={field.label}>{t(where)}
                  <select value={target} onChange={(e) => setTarget(e.target.value)} className={field.select}>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>)}
            {targets && where === "market" && <p className="m-0 text-sm">{targets.market ? t("marketPost", { place: targets.market.name }) : t("marketNone")}</p>}
            {where === "group" && options.length > 0 && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={asPost} onChange={() => setAsPost(!asPost)} className="h-5 w-5 accent-[var(--ink)]" />{t("groupPost")}</label>
            )}
            <label className={field.label}>{t("note")}
              <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className={field.textarea} />
            </label>
            <span className="text-[13px] text-muted">{t("privateHint")}</span>
            {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
            {done && <p role="status" className="m-0 flex items-center gap-2 font-bold"><IconCheck /> {done}</p>}
            <div className="flex gap-3">
              <button type="button" disabled={pending || !ready} onClick={send} className={btn.primaryLg}>{where === "group" && !asPost ? t("groupCollect") : t("send")}</button>
              <button type="button" onClick={() => setOpen(false)} className={btn.secondaryLg}>{t("close")}</button>
            </div>
            </>}
            {where === "out" && <button type="button" onClick={() => setOpen(false)} className={`${btn.secondaryLg} self-start`}>{t("close")}</button>}
          </div>
        </div>
      )}
    </>
  );
}
