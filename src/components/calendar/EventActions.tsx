"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EventPerson, EventRole, RsvpStatus } from "@/lib/calendar";
import { cancelEvent, cancelOccurrence, dutyAction } from "@/lib/actions/calendar";
import { sendOrQueue } from "@/lib/queue";
import { ConfirmAction, useAction } from "../ui/Action";
import { Notice } from "../ui/Page";
import { btn, field, segment, segments } from "../ui/styles";

/** Zusage, Vielleicht, Absage for one date, with the role one comes as and a short note. */
export function RsvpPanel({ id, at, mine, myRole, myNote, roles, full, slug }: {
  id: string; at: string; mine: RsvpStatus | null; myRole: string | null; myNote: string | null; roles: EventRole[]; full: boolean; slug: string | null;
}) {
  const t = useTranslations("calendar.rsvp");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [role, setRole] = useState<string>(myRole ?? "");
  const [note, setNote] = useState(myNote ?? "");
  // The answer shows at once; without a connection it waits on the device.
  const [shown, setShown] = useState<RsvpStatus | null>(mine);
  const [seen, setSeen] = useState(mine);
  if (seen !== mine) { setSeen(mine); setShown(mine); }
  const [kept, setKept] = useState(false);
  const send = (s: RsvpStatus | null) => {
    setShown(s);
    run(() => sendOrQueue("rsvp", { id, at, status: s, roleId: s === "yes" || s === "maybe" ? role || null : null, note: s ? note : "", slug }), {
      refresh: false, onOk: (r) => { setKept(!!r.queued); if (!r.queued) router.refresh(); }, onError: () => setShown(mine),
    });
  };
  return (
    <div className="flex flex-col gap-3">
      {shown && <strong>{t(`mine.${shown}`)}</strong>}
      {roles.length > 0 && (
        <label className={field.label}>{t("as")}
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field.select} max-w-[280px]`}>
            <option value="">{t("noRole")}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
      <label className={field.label}>{t("note")}
        <input maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} className={`${field.input} max-w-[480px]`} />
      </label>
      <span role="group" aria-label={t("who")} className={segments}>
        {(["yes", "maybe", "no"] as const).map((s) => (
          <button key={s} type="button" disabled={pending || (s === "yes" && full && shown !== "yes")} aria-pressed={shown === s} onClick={() => send(s)}
            className={`${segment(shown === s)} h-11 px-4`}>{t(s)}</button>
        ))}
      </span>
      {shown && <button type="button" disabled={pending} onClick={() => send(null)} className={`${btn.linkMuted} self-start`}>{t("undo")}</button>}
      {kept && <Notice tone="hint">{tc("savedOffline")}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** A duty's date: tick off, take over, look for cover, or (admins) put somebody on it. */
export function DutyPanel({ id, at, me, assignee, done, cover, canAssign, members, slug }: {
  id: string; at: string; me: string; assignee: string | null; done: boolean; cover: boolean; canAssign: boolean; members: EventPerson[]; slug: string | null;
}) {
  const t = useTranslations("calendar.duty");
  const { run, pending, error } = useAction();
  const go = (a: Parameters<typeof dutyAction>[2], who: string | null = null) => run(() => dutyAction(id, at, a, who, "", slug));
  const mine = assignee === me;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!done && (mine || canAssign) && <button type="button" disabled={pending} onClick={() => go("done")} className={btn.primary}>{t("markDone")}</button>}
        {done && <button type="button" disabled={pending} onClick={() => go("undone")} className={btn.secondary}>{t("undone")}</button>}
        {!done && !mine && <button type="button" disabled={pending} onClick={() => go("take")} className={cover ? btn.red : btn.secondary}>{t("take")}</button>}
        {!done && mine && !cover && <button type="button" disabled={pending} onClick={() => go("cover")} className={btn.secondary}>{t("askCover")}</button>}
        {!done && cover && (mine || canAssign) && <button type="button" disabled={pending} onClick={() => go("uncover")} className={btn.secondary}>{t("stopCover")}</button>}
      </div>
      {canAssign && !done && (
        <label className={field.label}>{t("assignLabel")}
          <select value={assignee ?? ""} disabled={pending} onChange={(e) => go("assign", e.target.value || null)} className={`${field.select} max-w-[280px]`}>
            <option value="">–</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** For whoever may change the date: cancel this one date, the whole thing, bring it back, delete. */
export function EditorActions({ id, at, series, cancelledAll, cancelledOne, slug }: {
  id: string; at: string; series: boolean; cancelledAll: boolean; cancelledOne: boolean; slug: string | null;
}) {
  const t = useTranslations("calendar.detail");
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {series && !cancelledAll && (
          <button type="button" disabled={pending} onClick={() => run(() => cancelOccurrence(id, at, !cancelledOne, slug))} className={btn.secondarySm}>
            {cancelledOne ? t("restoreDate") : t("cancelDate")}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => cancelEvent(id, cancelledAll ? "restore" : "cancel", slug))} className={btn.secondarySm}>
          {cancelledAll ? t("restore") : series ? t("cancelAllSeries") : t("cancelAll")}
        </button>
        <ConfirmAction label={t("delete")} question={t("deleteConfirm")} confirm={t("delete")} variant="secondary" size="sm" disabled={pending}
          onConfirm={() => run(() => cancelEvent(id, "delete", slug), { refresh: false, onOk: () => router.push(slug ? `/groups/${slug}?tab=calendar` : "/me/calendar") })} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
