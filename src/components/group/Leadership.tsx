"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cancelTransfer, openMotion, proposeTransfer, respondTransfer, voteMotion } from "@/lib/actions/groups";
import { dateTime } from "@/lib/format";
import { btn, field } from "../ui/styles";

export type TransferView = { id: string; status: "proposed" | "accepted"; to_id: string; to_name: string; from_id: string; from_name: string; executes_at: string | null };
export type MotionView = { id: string; kind: "takeover" | "recall"; subject_name: string; closes_at: string; yes: number; no: number; members: number; mine: boolean | null };

/** Who leads the group, handing it over, and the members' votes to take over or recall the leadership. */
export function Leadership({ slug, groupId, ownerId, ownerName, orphaned, viewerId, isMember, candidates, transfer, motion, canTakeover }: {
  slug: string; groupId: string; ownerId: string | null; ownerName: string | null; orphaned: boolean; viewerId?: string; isMember: boolean;
  candidates: { id: string; name: string }[]; transfer: TransferView | null; motion: MotionView | null; canTakeover: boolean;
}) {
  const t = useTranslations("grouprights.lead");
  const tm = useTranslations("grouprights.motion");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [to, setTo] = useState(candidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!viewerId && viewerId === ownerId;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    router.refresh();
  });
  return (
    <section aria-label={t("title")} className="flex flex-col gap-3">
      <h2 className="m-0 text-2xl font-bold">{t("title")}</h2>
      {ownerName ? <strong>{t("owner", { name: ownerName })}</strong> : <strong>{t("orphaned")}</strong>}
      {ownerName && <span className="text-sm text-muted">{t("ownerHint")}</span>}
      {orphaned && ownerName && <span className="text-sm font-bold">{t("orphaned")}</span>}

      {transfer && viewerId === transfer.to_id && transfer.status === "proposed" && (
        <div role="status" className="flex flex-col gap-2 border border-ink bg-surface p-3">
          <span>{t("transferAsk", { name: transfer.from_name })}</span>
          <span className="flex gap-2">
            <button type="button" disabled={pending} className={btn.primary} onClick={() => run(() => respondTransfer(slug, transfer.id, true))}>{t("transferAccept")}</button>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => run(() => respondTransfer(slug, transfer.id, false))}>{t("transferDecline")}</button>
          </span>
        </div>
      )}
      {transfer && isOwner && (
        <div role="status" className="flex flex-col gap-2 border border-line bg-surface p-3">
          <span>{transfer.status === "accepted" && transfer.executes_at ? t("transferAccepted", { name: transfer.to_name, date: dateTime(transfer.executes_at, locale) }) : t("transferPending", { name: transfer.to_name })}</span>
          <button type="button" disabled={pending} className={`${btn.secondary} self-start`} onClick={() => run(() => cancelTransfer(slug, transfer.id))}>{t("transferCancel")}</button>
        </div>
      )}
      {isOwner && !transfer && (
        <div className="flex flex-col gap-2">
          <strong>{t("transfer")}</strong>
          {candidates.length === 0 ? <span className="text-sm text-muted">{t("transferNeed")}</span> : (
            <span className="flex flex-wrap items-end gap-2">
              <label className={field.label}>{t("transferTo")}
                <select value={to} onChange={(e) => setTo(e.target.value)} className={`${field.select} h-11`}>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <button type="button" disabled={pending || !to} className={btn.primary} onClick={() => run(() => proposeTransfer(slug, groupId, to))}>{t("transferSend")}</button>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <strong>{tm("title")}</strong>
        {motion ? (
          <div className="flex flex-col gap-2 border border-ink bg-surface p-3">
            <strong>{motion.kind === "takeover" ? tm("takeoverText", { name: motion.subject_name }) : tm("recallText", { name: motion.subject_name })}</strong>
            <span className="text-sm">{tm("counts", { yes: motion.yes, no: motion.no, members: motion.members })} · {tm("closes", { date: dateTime(motion.closes_at, locale) })}</span>
            <span className="text-sm text-muted">{motion.kind === "takeover" ? tm("rulesTakeover") : tm("rulesRecall")}</span>
            {isMember && (
              <span className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={pending} aria-pressed={motion.mine === true} className={motion.mine === true ? btn.primary : btn.secondary} onClick={() => run(() => voteMotion(slug, motion.id, true))}>{tm("yes")}</button>
                <button type="button" disabled={pending} aria-pressed={motion.mine === false} className={motion.mine === false ? btn.primary : btn.secondary} onClick={() => run(() => voteMotion(slug, motion.id, false))}>{tm("no")}</button>
                {motion.mine !== null && <span className="text-sm">{tm("mine", { v: motion.mine ? tm("yesV") : tm("noV") })}</span>}
              </span>
            )}
          </div>
        ) : (
          <>
            <span className="text-sm text-muted">{tm("none")}</span>
            {isMember && (
              <span className="flex flex-wrap gap-2">
                {canTakeover && <button type="button" disabled={pending} className={btn.secondary} onClick={() => run(() => openMotion(slug, groupId, "takeover"))}>{tm("openTakeover")}</button>}
                {ownerId && !isOwner && <button type="button" disabled={pending} className={btn.secondary} onClick={() => run(() => openMotion(slug, groupId, "recall"))}>{tm("openRecall")}</button>}
              </span>
            )}
          </>
        )}
      </div>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
    </section>
  );
}
