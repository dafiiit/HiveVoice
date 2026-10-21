"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { grantAccess, revokeAccess, setAccess, type AccessGrant, type Scope } from "@/lib/actions/share";
import { Avatar } from "../ui/Avatar";
import { PersonPicker } from "../ui/PersonPicker";
import { btn, field } from "../ui/styles";
import { CopyField } from "../ui/Copy";

const ORDER: Scope[] = ["me", "people", "group", "link", "public"];

/**
 * Who may read and who may edit, set separately: only me, specific people, the group, anyone with the link,
 * everyone. Editing can never be more open than reading. For offers, requests and tasks.
 */
export function AccessPanel({ type, id, read, write, hasGroup, linkUrl, grants, path, bare = false }: {
  type: "listing" | "task" | "list"; id: string; read: Scope; write: Scope; hasGroup: boolean; linkUrl: string | null; grants: AccessGrant[]; path: string;
  /** Inside the share window: no fold, no frame. */
  bare?: boolean;
}) {
  const t = useTranslations("refs.access");
  const tc = useTranslations("common");
  const [r, setR] = useState(read);
  const [w, setW] = useState(write);
  const [link, setLink] = useState(linkUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scopes = ORDER.filter((s) => s !== "group" || hasGroup);

  const save = (nr: Scope, nw: Scope) => {
    // editing never wider than reading: narrow it along
    const fixedW = ORDER.indexOf(nw) > ORDER.indexOf(nr) ? nr : nw;
    setR(nr); setW(fixedW); setMsg(null);
    start(async () => {
      const res = await setAccess(type, id, nr, fixedW, path);
      if (!res.ok) return setMsg(t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.no_group") : tc(`errors.${res.error}` as "errors.unknown"));
      setLink(res.data ? `${window.location.origin}/r/${type}/${id}?k=${res.data}` : null);
      setMsg(t("saved"));
    });
  };
  const usesPeople = r === "people" || w === "people";

  const body = (
      <div className={`flex flex-col gap-4 ${bare ? "" : "mt-4"}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field.label}>{t("read")}
            <select value={r} disabled={pending} onChange={(e) => save(e.target.value as Scope, w)} className={field.select}>
              {scopes.map((s) => <option key={s} value={s}>{t(`scopes.${s}`)}</option>)}
            </select>
          </label>
          <label className={field.label}>{t("write")}
            <select value={w} disabled={pending} onChange={(e) => save(r, e.target.value as Scope)} className={field.select}>
              {scopes.filter((s) => ORDER.indexOf(s) <= ORDER.indexOf(r)).map((s) => <option key={s} value={s}>{t(`scopes.${s}`)}</option>)}
            </select>
          </label>
        </div>
        <span className="text-[13px] text-muted">{t("writeHint")}</span>
        {link && (r === "link" || w === "link") && <CopyField value={link} label={t("linkLabel")} copyLabel={t("copy")} />}
        {usesPeople && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">{t("people")}</span>
            {grants.map((g) => (
              <div key={g.profile_id} className="flex items-center gap-3 border-b border-line py-2 text-sm">
                <Avatar name={g.name} seed={g.seed} size={28} />
                <span className="flex-1"><strong>{g.name}</strong> · {g.can_write ? t("canWrite") : t("canRead")}</span>
                {w === "people" && (
                  <button type="button" disabled={pending} onClick={() => start(async () => { await grantAccess(type, id, g.profile_id, !g.can_write, path); })} className={`${btn.link} text-sm`}>
                    {g.can_write ? t("canRead") : t("canWrite")}
                  </button>
                )}
                <button type="button" disabled={pending} onClick={() => start(async () => { await revokeAccess(type, id, g.profile_id, path); })} className={`${btn.linkMuted} text-sm`}>{t("remove")}</button>
              </div>
            ))}
            <PersonPicker label={t("search")} placeholder={t("search")} exclude={grants.map((g) => g.profile_id)} disabled={pending}
              action={(h, clear) => <button type="button" disabled={pending} onClick={() => start(async () => { await grantAccess(type, id, h.id, w === "people", path); clear(); })} className={btn.secondarySm}>{t("add")}</button>} />
          </div>
        )}
        {msg && <p role="status" className="m-0 text-sm font-bold">{msg}</p>}
      </div>
  );
  if (bare) return body;
  return (
    <details className="max-w-[720px] border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">{t("title")} <span className="font-normal text-muted">· {t("read")}: {t(`scopes.${r}`)} · {t("write")}: {t(`scopes.${w}`)}</span></summary>
      {body}
    </details>
  );
}
