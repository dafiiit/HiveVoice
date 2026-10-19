"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { decideJoin, removeMemberWithReason, setPermission, setRole } from "@/lib/actions/groups";
import { Avatar } from "../ui/Avatar";
import { btn } from "../ui/styles";

const PERMS = ["read", "post", "propose_goals", "vote_goals", "edit_tasks", "edit_files", "approve_changes", "manage_members", "manage_finances", "archive"] as const;
const HOLDERS = ["maintainer", "contributor", "guest", "public"] as const;

export function Team({ slug, groupId, ownerId, members, requests, perms, myRole, canManage, viewerId }: {
  slug: string; groupId: string; ownerId: string | null;
  members: { id: string; name: string; seed: number; path: string | null; role: string; focus: string | null }[];
  requests: { id: string; profile_id: string; name: string; seed: number; path: string | null; message: string | null }[];
  perms: Record<string, Record<string, boolean>>;
  myRole: string | null; canManage: boolean; viewerId?: string;
}) {
  const t = useTranslations("group");
  const tr = useTranslations("grouprights");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [ban, setBan] = useState<"none" | "30" | "forever">("none");
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!viewerId && viewerId === ownerId;
  const isAdmin = myRole === "admin";
  const admins = members.filter((m) => m.role === "admin").length;
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col">
        <h2 className="m-0 mb-3 text-2xl font-bold">{t("members", { n: members.length })}</h2>
        {error && <p role="alert" className="m-0 mb-2 border-l-4 border-red pl-3 font-bold">{error}</p>}
        {members.map((m) => {
          const locked = m.role === "admin" && admins === 1;
          const owner = m.id === ownerId;
          const canRemove = canManage && m.id !== viewerId && !owner && !locked && (isOwner || m.role !== "admin");
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3">
              <Link href={`/profile/${m.id}`} className="flex min-w-[220px] flex-1 items-center gap-3 text-ink no-underline">
                <Avatar name={m.name} seed={m.seed} path={m.path} size={36} />
                <span className="flex flex-col"><strong>{m.name}</strong><span className="text-sm text-muted">{owner ? `${tr("lead.owner", { name: "" }).replace(/:\s*$/, "")} · ` : ""}{t(`roles.${m.role}`)}{m.focus ? ` · ${m.focus}` : ""}</span></span>
              </Link>
              {canManage && (
                <>
                  <label className="flex items-center gap-2 text-sm"><span className="sr-only">{t("roleOf", { name: m.name })}</span>
                    <select value={m.role} disabled={pending || locked || owner || (!isOwner && m.role === "admin")} className="h-10 border border-ink bg-surface px-2 text-ink"
                      onChange={(e) => start(async () => { const r = await setRole(slug, groupId, m.id, e.target.value); setError(r.ok ? null : tc(`errors.${r.error}` as "errors.unknown")); })}>
                      {(["admin", "maintainer", "contributor", "guest"] as const).filter((r) => isOwner || r !== "admin").map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                    </select>
                  </label>
                  {canRemove && removing !== m.id && (
                    <button type="button" disabled={pending} onClick={() => { setRemoving(m.id); setReason(""); setBan("none"); }} className="border-0 bg-transparent text-sm text-muted underline">{t("remove")}</button>
                  )}
                </>
              )}
              {m.id === viewerId && locked && <span className="text-sm text-muted">{t("onlyAdmin")}</span>}
              {removing === m.id && (
                <div className="flex w-full flex-wrap items-end gap-2 border border-ink bg-surface p-3">
                  <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-bold">{tr("remove.reason")}
                    <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="h-11 border border-line bg-surface px-3 font-normal text-ink" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-bold">{tr("remove.ban")}
                    <select value={ban} onChange={(e) => setBan(e.target.value as typeof ban)} className="h-11 border border-line bg-surface px-2 font-normal text-ink">
                      <option value="none">{tr("remove.none")}</option><option value="30">{tr("remove.d30")}</option><option value="forever">{tr("remove.forever")}</option>
                    </select>
                  </label>
                  <button type="button" disabled={pending || reason.trim().length < 3} className={btn.red}
                    onClick={() => start(async () => { const r = await removeMemberWithReason(slug, groupId, m.id, reason, ban); setError(r.ok ? null : tc(`errors.${r.error}` as "errors.unknown")); setRemoving(null); })}>{tr("remove.confirm")}</button>
                  <button type="button" onClick={() => setRemoving(null)} className={btn.secondary}>{tr("remove.cancel")}</button>
                </div>
              )}
            </div>
          );
        })}
      </section>
      {canManage && requests.length > 0 && (
        <section className="flex flex-col">
          <h2 className="m-0 mb-3 text-2xl font-bold">{t("wantToJoin")}</h2>
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3">
              <span className="flex min-w-[220px] flex-1 items-center gap-3"><Avatar name={r.name} seed={r.seed} path={r.path} size={36} />
                <span className="flex flex-col"><strong>{r.name}</strong>{r.message && <span className="text-sm">{r.message}</span>}</span></span>
              <button type="button" disabled={pending} onClick={() => start(async () => { await decideJoin(slug, r.id, true); })} className={btn.primary}>{t("accept")}</button>
              <button type="button" disabled={pending} onClick={() => start(async () => { await decideJoin(slug, r.id, false); })} className={btn.secondary}>{t("decline")}</button>
            </div>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("rights")}</h2>
        <span className="text-sm">{t("rightsText")}</span>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2 text-left">{t("right")}</th>
                <th scope="col" className="px-2 py-2">{t("roles.admin")}</th>
                {HOLDERS.map((h) => <th key={h} scope="col" className="px-2 py-2">{t(`holders.${h}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMS.map((p) => (
                <tr key={p} className="border-b border-line">
                  <th scope="row" className="py-2 text-left font-normal">{t(`perms.${p}`)}</th>
                  <td className="px-2 py-2 text-center"><span aria-label={`${t("roles.admin")}: ${t(`perms.${p}`)}`} className="inline-block h-5 w-5 bg-ink" /></td>
                  {HOLDERS.map((h) => {
                    const on = !!perms[h]?.[p];
                    const fixed = !isAdmin || (h === "public" && !["read", "vote_goals"].includes(p));
                    return (
                      <td key={h} className="px-2 py-2 text-center">
                        <button type="button" role="switch" aria-checked={on} aria-label={`${t(`holders.${h}`)}: ${t(`perms.${p}`)}`} disabled={fixed || pending}
                          onClick={() => start(async () => { await setPermission(slug, groupId, h, p, !on); })}
                          className={`h-5 w-5 border border-ink p-0 ${on ? "bg-ink" : "bg-surface"} ${fixed ? "cursor-default" : "cursor-pointer"}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
