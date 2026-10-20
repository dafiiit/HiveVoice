"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { shareTargets, shareToChat, shareToGroup, shareToMarket, type ShareTargets } from "@/lib/actions/share";
import type { RefType } from "@/lib/refs";
import { IconCheck } from "../ui/Icons";
import { ShareButtons } from "../ShareButtons";
import { Dialog } from "../ui/Dialog";
import { btn, chip, field, segment, segments } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

type Where = "chat" | "group" | "market";
type Tab = "app" | "out" | "access";

/**
 * The one "Teilen" button for everything (offers, wanted posts, documents, groups, tasks, initiatives).
 * Its window has up to three tabs: "In der App" (a card into a chat, a group or the noticeboard),
 * "Link / QR" for public things (share sheet, link, QR code) and "Zugriff" (who may read and edit) for
 * the people who manage it.
 */
export function ShareMenu({ type, id, title, className, external, access }: {
  type: RefType; id: string; title: string; className?: string; external?: { url: string; text: string }; access?: ReactNode;
}) {
  const t = useTranslations("refs.share");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("app");
  const [targets, setTargets] = useState<ShareTargets | null>(null);
  const [where, setWhere] = useState<Where>("chat");
  const [target, setTarget] = useState("");
  const [asPost, setAsPost] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => {
    setOpen(true); setTab("app"); setDone(null); setError(null);
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
        <Dialog title={t("title", { title })} onClose={() => setOpen(false)} wide>
            {(external || access) && (
              <div role="tablist" aria-label={t("button")} className={segments}>
                {(["app", ...(external ? ["out"] : []), ...(access ? ["access"] : [])] as Tab[]).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={segment(tab === k)}>{t(`tabs.${k}`)}</button>
                ))}
              </div>
            )}
            {tab === "out" && external && <ShareButtons url={external.url} title={title} text={external.text} />}
            {tab === "access" && access}
            {tab === "app" && <>
            <div role="radiogroup" aria-label={t("tabs.app")} className="flex flex-wrap gap-2">
              {(["chat", "group", "market"] as const).map((w) => (
                <button key={w} type="button" role="radio" aria-checked={where === w} onClick={() => pick(w)} className={chip(where === w)}>{t(w)}</button>
              ))}
            </div>
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
            {error && <Notice tone="error">{error}</Notice>}
            {done && <p role="status" className="m-0 flex items-center gap-2 font-bold"><IconCheck /> {done}</p>}
            <button type="button" disabled={pending || !ready} onClick={send} className={`${btn.primary} self-start`}>{where === "group" && !asPost ? t("groupCollect") : t("send")}</button>
            </>}
        </Dialog>
      )}
    </>
  );
}
