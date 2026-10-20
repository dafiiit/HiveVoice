"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  cancelResourceTransfer, grantResourceAccess, moveToGroup, proposeResourceTransfer, renewLink, revokeGrant, setResourceAccess,
} from "@/lib/actions/links";
import { PersonPicker } from "../ui/PersonPicker";
import { ActionError, useAction } from "../ui/Action";
import { dateLong } from "@/lib/format";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";
import { CopyField } from "../ui/Copy";

export type GrantRow = { id: string; level: string; expires_at: string | null; person_name: string | null; group_name: string | null };

/** For the people who manage a document: who sees it, who may change it, the link, single rights, hand-over. */
export function ShareAccess({ id, origin, visibility, editMode, allowDownload, license, linkUrl, grants, myGroups, hasGroup, groupId, transferTo, bare = false }: {
  id: string; origin: string; visibility: string; editMode: string; allowDownload: boolean; license: string | null; linkUrl: string | null;
  grants: GrantRow[]; myGroups: { id: string; name: string }[]; hasGroup: boolean; groupId: string | null; transferTo: string | null;
  /** Inside the share window: no frame and no heading. */
  bare?: boolean;
}) {
  const t = useTranslations("docrights");
  const locale = useLocale();
  const [vis, setVis] = useState(visibility);
  const [edit, setEdit] = useState(editMode);
  const [download, setDownload] = useState(allowDownload);
  const [lic, setLic] = useState(license ?? (origin === "note" ? "cc_by_sa" : "all_rights"));
  const [saved, setSaved] = useState(false);
  const [level, setLevel] = useState("view");
  const [until, setUntil] = useState("");
  const [grantGroup, setGrantGroup] = useState(myGroups[0]?.id ?? "");
  const [moveTarget, setMoveTarget] = useState(groupId ?? "");

  const { run: exec, pending, error } = useAction();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => exec(fn, { onOk: after });
  const visibilities = (hasGroup ? ["me", "invited", "group", "link", "public"] : ["me", "invited", "link", "public"]);

  return (
    <section aria-label={t("access.title")} className={`flex flex-col gap-5 ${bare ? "" : "border border-line bg-surface p-4"}`}>
      {!bare && <h2 className="m-0 text-xl font-bold">{t("access.title")}</h2>}

      <div className="flex flex-col gap-3">
        <label className={field.label}>{t("visibility.label")}
          <select value={vis} onChange={(e) => { setVis(e.target.value); setSaved(false); }} className={`${field.select} max-w-[360px]`}>
            {visibilities.map((v) => <option key={v} value={v}>{t(`visibility.${v}` as "visibility.me")}</option>)}
          </select>
          <span className={field.hint}>{t(`visibility.${vis}Text` as "visibility.meText")}</span>
        </label>
        {origin === "note" && (
          <label className={field.label}>{t("access.edit")}
            <select value={edit} onChange={(e) => { setEdit(e.target.value); setSaved(false); }} className={`${field.select} max-w-[460px]`}>
              <option value="me">{t("access.edit_me")}</option>
              {hasGroup && <option value="group">{t("access.edit_group")}</option>}
              <option value="suggest">{t("access.edit_suggest")}</option>
            </select>
          </label>
        )}
        {origin !== "link" && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={download} onChange={() => { setDownload(!download); setSaved(false); }} className="h-5 w-5 accent-[var(--ink)]" />{t("access.download")}</label>
        )}
        {origin !== "link" && <span className={field.hint}>{t("access.downloadHint")}</span>}
        {origin !== "link" && (vis === "public" || license) && (
          <label className={field.label}>{t("license.label")}
            <select value={lic} onChange={(e) => { setLic(e.target.value); setSaved(false); }} className={`${field.select} max-w-[460px]`}>
              {(["all_rights", "cc_by", "cc_by_sa", "cc0"] as const).map((l) => <option key={l} value={l}>{t(`license.${l}`)}</option>)}
            </select>
          </label>
        )}
        <span className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending} className={btn.primary} onClick={() => act(() => setResourceAccess(id, vis, edit, download, origin === "link" ? null : lic), () => setSaved(true))}>{t("access.save")}</button>
          {saved && <span role="status" className="text-sm font-bold">{t("access.saved")}</span>}
        </span>
      </div>

      {visibility === "link" && linkUrl && (
        <div className="flex flex-col gap-2">
          <CopyField value={linkUrl} label={t("access.link")} copyLabel={t("access.copyLink")} />
          <span className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending} className={`${btn.linkMuted} text-sm`} onClick={() => act(() => renewLink(id))}>{t("access.renew")}</button>
            <span className={field.hint}>{t("access.renewHint")}</span>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <strong>{t("access.grants")}</strong>
        {grants.length === 0 && <span className="text-sm text-muted">{t("access.noGrants")}</span>}
        {grants.map((g) => (
          <span key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1.5 text-sm">
            <span>{g.person_name ?? g.group_name} · {t(`access.level_${g.level}` as "access.level_view")}{g.expires_at ? ` · ${t("access.expires", { date: dateLong(g.expires_at, locale) })}` : ""}</span>
            <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => act(() => revokeGrant(id, g.id))}>{t("access.revoke")}</button>
          </span>
        ))}
        <span className={field.hint}>{t("access.revokeHint")}</span>
        <div className="flex flex-wrap items-end gap-3">
          <label className={field.label}>{t("access.level")}
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={field.select}>
              {(["view", "comment", "edit", "manage"] as const).map((l) => <option key={l} value={l}>{t(`access.level_${l}` as "access.level_view")}</option>)}
            </select>
          </label>
          <label className={field.label}>{t("access.until")}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${field.input} w-44`} /></label>
        </div>
        <strong className="text-sm">{t("access.addPerson")}</strong>
        <PersonPicker filter={{ kind: "verified" }} label={t("access.addPerson")} placeholder={t("access.search")} disabled={pending}
          onPick={(p) => act(() => grantResourceAccess(id, { profileId: p.id }, level, until || null))} />
        {myGroups.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <select value={grantGroup} onChange={(e) => setGrantGroup(e.target.value)} aria-label={t("access.pickGroup")} className={field.select}>{myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => act(() => grantResourceAccess(id, { groupId: grantGroup }, level, until || null))}>{t("access.addGroup")}</button>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <strong>{t("access.transfer")}</strong>
        {transferTo ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">{t("access.transferPending", { name: transferTo })}</span>
        ) : (
          <TransferPicker id={id} />
        )}
        <span className="flex flex-wrap items-center gap-2">
          <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} aria-label={t("access.moveGroup")} className={field.select}>
            <option value="">{t("access.moveNone")}</option>
            {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button type="button" disabled={pending || moveTarget === (groupId ?? "")} className={btn.secondary} onClick={() => act(() => moveToGroup(id, moveTarget || null))}>{t("access.moveSave")}</button>
        </span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function TransferPicker({ id }: { id: string }) {
  const t = useTranslations("docrights");
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{t("access.transferText")}</span>
      <PersonPicker filter={{ kind: "verified" }} label={t("access.transfer")} placeholder={t("access.search")} disabled={pending}
        onPick={(p) => run(() => proposeResourceTransfer(id, p.id))} />
      <ActionError error={error} />
    </div>
  );
}

export function CancelTransfer({ transferId }: { transferId: string }) {
  const t = useTranslations("docrights.access");
  const { run, pending } = useAction();
  return <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => run(() => cancelResourceTransfer(transferId))}>{t("cancel")}</button>;
}
