"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { decideJoin, removeMember, setPermission, setRole, updateGroup } from "@/lib/actions/groups";
import { Avatar } from "../ui/Avatar";
import { btn } from "../ui/styles";

const PERMS = ["read", "post", "propose_goals", "vote_goals", "edit_tasks", "edit_files", "approve_changes", "manage_members", "manage_finances", "archive"] as const;
const HOLDERS = ["maintainer", "contributor", "guest", "public"] as const;

export function Team({ slug, groupId, visibility, joinPolicy, members, requests, perms, myRole, canManage, viewerId }: {
  slug: string; groupId: string; visibility: string; joinPolicy: string;
  members: { id: string; name: string; seed: number; path: string | null; role: string; focus: string | null }[];
  requests: { id: string; profile_id: string; name: string; seed: number; path: string | null; message: string | null }[];
  perms: Record<string, Record<string, boolean>>;
  myRole: string | null; canManage: boolean; viewerId?: string;
}) {
  const t = useTranslations("group");
  const [pending, start] = useTransition();
  const isAdmin = myRole === "admin";
  const admins = members.filter((m) => m.role === "admin").length;
  const radio = (on: boolean) => `h-10 px-3.5 text-sm ${on ? "bg-ink text-on-ink font-bold" : "border border-ink bg-transparent text-ink"}`;
  return (
    <div className="flex flex-col gap-8">
      {isAdmin && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-bold">{t("visibility")}</span>
            {(["public", "members"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={visibility === v} disabled={pending} className={radio(visibility === v)}
                onClick={() => start(async () => { await updateGroup(slug, groupId, { visibility: v }); })}>{t(`vis.${v}`)}</button>
            ))}
            <span className="text-sm text-muted">{t(`visText.${visibility}`)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-bold">{t("joining")}</span>
            {(["open", "request"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={joinPolicy === v} disabled={pending} className={radio(joinPolicy === v)}
                onClick={() => start(async () => { await updateGroup(slug, groupId, { joinPolicy: v }); })}>{t(`policy.${v}`)}</button>
            ))}
            <span className="text-sm text-muted">{t(`policyText.${joinPolicy}`)}</span>
          </div>
        </div>
      )}
      <section className="flex flex-col">
        <h2 className="m-0 mb-3 text-2xl font-bold">{t("members", { n: members.length })}</h2>
        {members.map((m) => {
          const locked = m.role === "admin" && admins === 1;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3">
              <Link href={`/profile/${m.id}`} className="flex min-w-[220px] flex-1 items-center gap-3 text-ink no-underline">
                <Avatar name={m.name} seed={m.seed} path={m.path} size={36} />
                <span className="flex flex-col"><strong>{m.name}</strong><span className="text-sm text-muted">{t(`roles.${m.role}`)}{m.focus ? ` · ${m.focus}` : ""}</span></span>
              </Link>
              {canManage && (
                <>
                  <label className="flex items-center gap-2 text-sm"><span className="sr-only">{t("roleOf", { name: m.name })}</span>
                    <select value={m.role} disabled={pending || locked || (!isAdmin && m.role === "admin")} className="h-10 border border-ink bg-surface px-2 text-ink"
                      onChange={(e) => start(async () => { await setRole(slug, groupId, m.id, e.target.value); })}>
                      {(["admin", "maintainer", "contributor", "guest"] as const).filter((r) => isAdmin || r !== "admin").map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                    </select>
                  </label>
                  {m.id !== viewerId && !locked && (isAdmin || m.role !== "admin") && (
                    <button type="button" disabled={pending} onClick={() => start(async () => { await removeMember(slug, groupId, m.id); })} className="border-0 bg-transparent text-sm text-muted underline">{t("remove")}</button>
                  )}
                </>
              )}
              {m.id === viewerId && locked && <span className="text-sm text-muted">{t("onlyAdmin")}</span>}
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
