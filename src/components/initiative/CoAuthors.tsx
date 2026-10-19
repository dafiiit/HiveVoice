"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  handOverLead, inviteAuthor, leaveInitiative, proposeAuthorRemoval, searchCoAuthors, setInitiativeGroup, voteAuthorRemoval,
  withdrawAuthorInvite, type CoAuthorHit,
} from "@/lib/actions/initiatives";
import { Avatar } from "../ui/Avatar";
import { btn, chip, field } from "../ui/styles";

export type AuthorRow = { id: string; name: string; seed: number; path: string | null };
export type PendingInvite = { id: string; name: string };
export type RemovalRow = { id: string; subject_id: string; subject_name: string; yes: number; no: number; mine: boolean | null };

/** Who writes this initiative: invitations, leaving, handing over the lead, removal by majority, attaching a group. */
export function CoAuthors({ id, authors, leadId, me, invites, removals, max, groups, groupId }: {
  id: string; authors: AuthorRow[]; leadId: string | null; me: string; invites: PendingInvite[]; removals: RemovalRow[]; max: number;
  groups: { id: string; name: string }[]; groupId: string | null;
}) {
  const t = useTranslations("inirights.authors");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CoAuthorHit[] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [group, setGroup] = useState(groupId ?? "");
  const [saved, setSaved] = useState(false);
  const isLead = leadId === me;
  const full = authors.length + invites.length >= max;

  useEffect(() => {
    const h = setTimeout(() => { if (q.trim().length >= 3) searchCoAuthors(id, q).then(setHits); else setHits(null); }, 300);
    return () => clearTimeout(h);
  }, [q, id]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const res = await fn();
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    if (res.ok) after?.();
    router.refresh();
  });

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
                <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-muted underline"
                  onClick={() => { if (confirm(t("leaveConfirm"))) act(() => leaveInitiative(id)); }}>{t("leave")}</button>
              )}
              {isLead && a.id !== me && (
                <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-muted underline"
                  onClick={() => { if (confirm(t("handOverConfirm"))) act(() => handOverLead(id, a.id)); }}>{t("handOver")}</button>
              )}
              {a.id !== me && a.id !== leadId && !removals.some((r) => r.subject_id === a.id) && (
                <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-muted underline"
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
            <button type="button" disabled={pending} aria-pressed={r.mine === true} className={`${chip(r.mine === true)} h-9`} onClick={() => act(() => voteAuthorRemoval(id, r.id, true))}>{t("yes")}</button>
            <button type="button" disabled={pending} aria-pressed={r.mine === false} className={`${chip(r.mine === false)} h-9`} onClick={() => act(() => voteAuthorRemoval(id, r.id, false))}>{t("no")}</button>
          </span>
        </div>
      ))}

      {invites.length > 0 && (
        <div className="flex flex-col">
          <strong className="pb-1 text-sm">{t("pending")}</strong>
          {invites.map((v) => (
            <span key={v.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
              {v.name}
              <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-muted underline" onClick={() => act(() => withdrawAuthorInvite(id, v.id))}>{t("withdrawInvite")}</button>
            </span>
          ))}
        </div>
      )}

      {!full && (
        <div className="flex flex-col gap-2">
          <strong>{t("invite")}</strong>
          <span className="text-sm text-muted">{t("inviteText")} {t("max", { n: max })}</span>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setSent(null); }} placeholder={t("search")} aria-label={t("search")} className={`${field.inputSm} max-w-[420px]`} />
          {hits && hits.length === 0 && <span className="text-sm text-muted">{t("noHits")}</span>}
          {hits && hits.map((p) => (
            <span key={p.id} className="flex max-w-[520px] items-center justify-between gap-3 border-b border-line py-1.5">
              <span className="flex min-w-0 flex-col"><strong className="truncate">{p.name}</strong>{p.headline && <span className="truncate text-sm text-muted">{p.headline}</span>}</span>
              <button type="button" disabled={pending} className={`${chip(false)} h-9 font-bold`}
                onClick={() => act(() => inviteAuthor(id, p.id), () => { setSent(p.name); setHits(null); setQ(""); })}>{t("send")}</button>
            </span>
          ))}
          {sent && <span role="status" className="text-sm font-bold">{t("sent")} {sent}</span>}
        </div>
      )}

      {isLead && groups.length > 0 && (
        <div className="flex flex-col gap-2">
          <strong>{t("group")}</strong>
          <span className="text-sm text-muted">{t("groupText")}</span>
          <span className="flex flex-wrap items-center gap-2">
            <select value={group} onChange={(e) => { setGroup(e.target.value); setSaved(false); }} aria-label={t("group")} className={`${field.select} h-11`}>
              <option value="">{t("groupNone")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button type="button" disabled={pending || group === (groupId ?? "")} className={btn.secondary} onClick={() => act(() => setInitiativeGroup(id, group || null), () => setSaved(true))}>{t("groupSave")}</button>
            {saved && <span role="status" className="text-sm font-bold">{t("groupSaved")}</span>}
          </span>
        </div>
      )}
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
    </section>
  );
}
