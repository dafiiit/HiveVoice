"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { blockProfile, hideChat, muteChat, proposeTtl } from "@/lib/actions/safety";
import { Popover } from "../ui/Popover";
import { useAction } from "../ui/Action";

export type TtlState = { days: number | null; proposedDays: number | null; proposedByMe: boolean };

/** The "more" menu of a private chat: notifications, disappearing messages, blocking, clearing the chat for me. */
export function ChatMenu({ conversationId, otherId, otherName, muted, blocked, ttl }: {
  conversationId: string; otherId: string; otherName: string; muted: boolean; blocked: boolean; ttl: TtlState;
}) {
  const t = useTranslations("safety.chat");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const { run: exec, pending, error } = useAction();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => { setConfirm(false); exec(fn); };
  const item = "flex h-10 w-full items-center justify-between gap-2 border-0 border-b border-line bg-transparent px-0 text-left text-ink last:border-b-0";
  return (
    <Popover label={<span>{t("more")}</span>} align="right">
      <div className="flex flex-col" role="group" aria-label={t("more")}>
        <button type="button" disabled={pending} className={item} onClick={() => run(() => muteChat(conversationId, !muted))}>
          {muted ? t("unmute") : t("mute")}
        </button>

        <div className="flex flex-col gap-1.5 border-b border-line py-2">
          <strong className="text-sm">{t("ttl")}</strong>
          {ttl.days && <span className="text-sm">{t("ttlActive", { days: ttl.days })}</span>}
          {ttl.proposedDays && ttl.proposedByMe && <span className="text-sm">{t("ttlMine", { days: ttl.proposedDays, name: otherName })}</span>}
          {ttl.proposedDays && !ttl.proposedByMe && (
            <>
              <span className="text-sm">{t("ttlTheirs", { days: ttl.proposedDays, name: otherName })}</span>
              <span className="flex gap-2">
                <button type="button" disabled={pending} className="inline-flex h-9 items-center border-0 bg-ink px-3 text-sm font-bold text-on-ink" onClick={() => run(() => proposeTtl(conversationId, ttl.proposedDays as 7 | 30))}>{t("ttlAgree")}</button>
                <button type="button" disabled={pending} className="inline-flex h-9 items-center border border-line-strong bg-transparent px-3 text-sm text-ink" onClick={() => run(() => proposeTtl(conversationId, null))}>{t("ttlDecline")}</button>
              </span>
            </>
          )}
          <span className="flex flex-wrap gap-1.5" role="group" aria-label={t("ttl")}>
            {([null, 7, 30] as const).map((d) => (
              <button key={String(d)} type="button" disabled={pending} aria-pressed={(ttl.days ?? null) === d && !ttl.proposedDays}
                className={`inline-flex h-8 items-center border px-2.5 text-sm ${(ttl.days ?? null) === d && !ttl.proposedDays ? "border-ink bg-ink font-bold text-on-ink" : "border-line bg-surface text-ink"}`}
                onClick={() => run(() => proposeTtl(conversationId, d))}>{d === null ? t("ttlOff") : t(d === 7 ? "ttl7" : "ttl30")}</button>
            ))}
          </span>
        </div>

        <button type="button" disabled={pending} className={item} onClick={() => run(() => blockProfile(otherId, !blocked))}>
          {blocked ? t("unblock") : t("block", { name: otherName })}
        </button>

        {!confirm ? (
          <button type="button" className={item} onClick={() => setConfirm(true)}>{t("clear")}</button>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            <span className="text-sm">{t("clearConfirm")}</span>
            <span className="flex gap-2">
              <button type="button" disabled={pending} className="inline-flex h-9 items-center border-0 bg-red px-3 text-sm font-bold text-on-red" onClick={() => run(async () => { const r = await hideChat(conversationId); if (r.ok) router.push("/connect"); return r; })}>{t("yes")}</button>
              <button type="button" className="inline-flex h-9 items-center border border-line-strong bg-transparent px-3 text-sm text-ink" onClick={() => setConfirm(false)}>{t("no")}</button>
            </span>
          </div>
        )}
        {error && <span role="alert" className="pt-1 text-sm font-bold">{error}</span>}
      </div>
    </Popover>
  );
}
