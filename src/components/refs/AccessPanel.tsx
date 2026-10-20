"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { findPeople, grantAccess, revokeAccess, setAccess, type AccessGrant, type Scope } from "@/lib/actions/share";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";

const ORDER: Scope[] = ["me", "people", "group", "link", "public"];

/**
 * Who may read and who may edit, set separately: only me, specific people, the group, anyone with the link,
 * everyone. Editing can never be more open than reading. For offers, requests and tasks.
 */
export function AccessPanel({ type, id, read, write, hasGroup, linkUrl, grants, path }: {
  type: "listing" | "task"; id: string; read: Scope; write: Scope; hasGroup: boolean; linkUrl: string | null; grants: AccessGrant[]; path: string;
}) {
  const t = useTranslations("refs.access");
  const tc = useTranslations("common");
  const [r, setR] = useState(read);
  const [w, setW] = useState(write);
  const [link, setLink] = useState(linkUrl);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; seed: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const scopes = ORDER.filter((s) => s !== "group" || hasGroup);

  useEffect(() => {
    if (q.trim().length < 3) return;
    const h = setTimeout(() => findPeople(q).then((res) => setHits(res.ok ? res.data : [])), 250);
    return () => clearTimeout(h);
  }, [q]);

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

  return (
    <details className="max-w-[720px] border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">{t("title")} <span className="font-normal text-muted">· {t("read")}: {t(`scopes.${r}`)} · {t("write")}: {t(`scopes.${w}`)}</span></summary>
      <div className="mt-4 flex flex-col gap-4">
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
        {link && (r === "link" || w === "link") && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t("linkLabel")}</span>
            <div className="flex gap-2">
              <input readOnly value={link} aria-label={t("linkLabel")} className={`${field.inputSm} flex-1`} onFocus={(e) => e.target.select()} />
              <button type="button" className={btn.secondary} onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? t("copied") : t("copy")}</button>
            </div>
          </div>
        )}
        {usesPeople && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">{t("people")}</span>
            {grants.map((g) => (
              <div key={g.profile_id} className="flex items-center gap-3 border-b border-line py-2 text-sm">
                <Avatar name={g.name} seed={g.seed} size={28} />
                <span className="flex-1"><strong>{g.name}</strong> · {g.can_write ? t("canWrite") : t("canRead")}</span>
                {w === "people" && (
                  <button type="button" disabled={pending} onClick={() => start(async () => { await grantAccess(type, id, g.profile_id, !g.can_write, path); })} className="border-0 bg-transparent text-sm underline">
                    {g.can_write ? t("canRead") : t("canWrite")}
                  </button>
                )}
                <button type="button" disabled={pending} onClick={() => start(async () => { await revokeAccess(type, id, g.profile_id, path); })} className="border-0 bg-transparent text-sm text-muted underline">{t("remove")}</button>
              </div>
            ))}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className={field.inputSm} />
            {q.trim().length >= 3 && hits.filter((h) => !grants.some((g) => g.profile_id === h.id)).map((h) => (
              <div key={h.id} className="flex items-center gap-3 text-sm">
                <Avatar name={h.name} seed={h.seed} size={28} />
                <span className="flex-1 font-bold">{h.name}</span>
                <button type="button" disabled={pending} onClick={() => start(async () => { await grantAccess(type, id, h.id, w === "people", path); setQ(""); setHits([]); })} className={btn.secondary}>{t("add")}</button>
              </div>
            ))}
          </div>
        )}
        {msg && <p role="status" className="m-0 text-sm font-bold">{msg}</p>}
      </div>
    </details>
  );
}
