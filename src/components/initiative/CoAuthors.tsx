"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  handOverLead, inviteAuthor, leaveInitiative, proposeAuthorRemoval, setInitiativeGroup, voteAuthorRemoval,
  withdrawAuthorInvite,
} from "@/lib/actions/initiatives";
import { Avatar } from "../ui/Avatar";
import { btn, chip, field } from "../ui/styles";
import { ConfirmAction, useAction } from "../ui/Action";
import { Notice } from "@/components/ui/Page";
import { PersonPicker } from "../ui/PersonPicker";

export type AuthorRow = { id: string; name: string; seed: number; path: string | null };
export type PendingInvite = { id: string; name: string };
export type RemovalRow = { id: string; subject_id: string; subject_name: string; yes: number; no: number; mine: boolean | null };

/** Who writes this initiative: invitations, leaving, handing over the lead, removal by majority, attaching a group. */
export function CoAuthors({ id, authors, leadId, me, invites, removals, max, groups, groupId }: {
  id: string; authors: AuthorRow[]; leadId: string | null; me: string; invites: PendingInvite[]; removals: RemovalRow[]; max: number;
  groups: { id: string; name: string }[]; groupId: string | null;
}) {
  const t = useTranslations("inirights.authors");
  const [sent, setSent] = useState<string | null>(null);
  const [group, setGroup] = useState(groupId ?? "");
  const [saved, setSaved] = useState(false);
  const isLead = leadId === me;
  const full = authors.length + invites.length >= max;

  const { run: exec, pending, error } = useAction();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => exec(fn, { onOk: after });

  return (
    <section aria-label={t("title")} className="flex flex-col gap-4 border border-line bg-surface p-4">
      <h2 className="m-0 text-xl font-bold">{t("title")}</h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {authors.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2">
            <span className="flex items-center gap-2">
              <Avatar name={a.name} seed={a.seed} path={a.path} size={28} />
              <strong>{a.name}</strong>
              {a.id === leadId && <span className="bg-ink px-2 text-xs font-bold text-on-ink">{t("lead")}</span>}
            </span>
            <span className="flex flex-wrap gap-3 text-sm">
              {a.id === me && a.id !== leadId && (
                <ConfirmAction disabled={pending} look={btn.linkMuted} question={t("leaveConfirm")} onConfirm={() => act(() => leaveInitiative(id))} label={t("leave")} />
              )}
              {isLead && a.id !== me && (
                <ConfirmAction disabled={pending} look={btn.linkMuted} question={t("handOverConfirm")} onConfirm={() => act(() => handOverLead(id, a.id))} label={t("handOver")} />
              )}
              {a.id !== me && a.id !== leadId && !removals.some((r) => r.subject_id === a.id) && (
                <button type="button" disabled={pending} className={btn.linkMuted}
                  onClick={() => act(() => proposeAuthorRemoval(id, a.id))}>{t("remove")}</button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {removals.map((r) => (
        <div key={r.id} role="group" aria-label={t("removalTitle", { name: r.subject_name })} className="flex flex-col gap-1.5 border-l-4 border-red pl-3">
          <strong>{t("removalTitle", { name: r.subject_name })}</strong>
          <span className="text-sm">{t("removalText")} · {t("removalCount", { yes: r.yes, no: r.no })}</span>
          <span className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} aria-pressed={r.mine === true} className={chip(r.mine === true)} onClick={() => act(() => voteAuthorRemoval(id, r.id, true))}>{t("yes")}</button>
            <button type="button" disabled={pending} aria-pressed={r.mine === false} className={chip(r.mine === false)} onClick={() => act(() => voteAuthorRemoval(id, r.id, false))}>{t("no")}</button>
          </span>
        </div>
      ))}

      {invites.length > 0 && (
        <div className="flex flex-col">
          <strong className="pb-1 text-sm">{t("pending")}</strong>
          {invites.map((v) => (
            <span key={v.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
              {v.name}
              <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => act(() => withdrawAuthorInvite(id, v.id))}>{t("withdrawInvite")}</button>
            </span>
          ))}
        </div>
      )}

      {!full && (
        <div className="flex flex-col gap-2">
          <strong>{t("invite")}</strong>
          <span className="text-sm text-muted">{t("inviteText")} {t("max", { n: max })}</span>
          <PersonPicker filter={{ kind: "notAuthor", initiativeId: id }} label={t("search")} placeholder={t("search")} disabled={pending}
            action={(p, clear) => <button type="button" disabled={pending} className={btn.secondarySm} onClick={() => act(() => inviteAuthor(id, p.id), () => { setSent(p.name); clear(); })}>{t("send")}</button>} />
          {sent && <span role="status" className="text-sm font-bold">{t("sent")} {sent}</span>}
        </div>
      )}

      {isLead && groups.length > 0 && (
        <div className="flex flex-col gap-2">
          <strong>{t("group")}</strong>
          <span className="text-sm text-muted">{t("groupText")}</span>
          <span className="flex flex-wrap items-center gap-2">
            <select value={group} onChange={(e) => { setGroup(e.target.value); setSaved(false); }} aria-label={t("group")} className={field.select}>
              <option value="">{t("groupNone")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button type="button" disabled={pending || group === (groupId ?? "")} className={btn.secondary} onClick={() => act(() => setInitiativeGroup(id, group || null), () => setSaved(true))}>{t("groupSave")}</button>
            {saved && <span role="status" className="text-sm font-bold">{t("groupSaved")}</span>}
          </span>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
