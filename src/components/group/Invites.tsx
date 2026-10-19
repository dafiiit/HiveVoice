"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createInviteLink, inviteMember, revokeInviteLink, searchInvitees, type Invitee } from "@/lib/actions/groups";
import { dateTime } from "@/lib/format";
import { btn, chip, field } from "../ui/styles";

export type InviteRow = { id: string; role: string; expires_at: string; max_uses: number | null; uses: number; code?: string };

/** Invitation links (with role, validity and a limit) and invitations to a person found by name. */
export function Invites({ slug, groupId, roles, links }: { slug: string; groupId: string; roles: string[]; links: InviteRow[] }) {
  const t = useTranslations("grouprights");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState(roles[0] ?? "contributor");
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Invitee[] | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => { if (q.trim().length >= 3) searchInvitees(groupId, q).then(setHits); else setHits(null); }, 300);
    return () => clearTimeout(h);
  }, [q, groupId]);

  const url = (code: string) => `${window.location.origin}/join/${code}`;
  const make = () => start(async () => {
    const res = await createInviteLink(slug, groupId, role, days, maxUses);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setError(null); setCopied(false); setFresh(url(res.data));
    router.refresh();
  });
  const copy = async () => { if (fresh) { await navigator.clipboard.writeText(fresh); setCopied(true); } };
  const invite = (p: Invitee) => start(async () => {
    const res = await inviteMember(slug, groupId, p.id, role, message);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setError(null); setSent(p.name); setHits(null); setQ(""); setMessage("");
  });

  return (
    <section aria-label={t("invite.title")} className="flex flex-col gap-4">
      <h2 className="m-0 text-2xl font-bold">{t("invite.title")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className={field.label}>{t("invite.role")}
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field.select} h-11`}>
            {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}` as "roles.admin")}</option>)}
          </select>
        </label>
        <label className={field.label}>{t("invite.days")}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${field.select} h-11`}>
            <option value={1}>{t("invite.d1")}</option><option value={7}>{t("invite.d7")}</option><option value={30}>{t("invite.d30")}</option>
          </select>
        </label>
        <label className={field.label}>{t("invite.uses")}
          <select value={maxUses ?? ""} onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)} className={`${field.select} h-11`}>
            <option value="">{t("invite.usesAny")}</option><option value={1}>{t("invite.uses1")}</option><option value={5}>{t("invite.uses5")}</option><option value={25}>{t("invite.uses25")}</option>
          </select>
        </label>
        <button type="button" disabled={pending} onClick={make} className={btn.primary}>{t("invite.create")}</button>
      </div>
      {fresh && (
        <div role="status" className="flex flex-wrap items-center gap-2 border border-ink bg-surface p-3">
          <input readOnly value={fresh} aria-label={t("invite.linkTitle")} onFocus={(e) => e.currentTarget.select()} className={`${field.inputSm} min-w-0 flex-1`} />
          <button type="button" onClick={() => void copy()} className={btn.secondary}>{copied ? t("invite.copied") : t("invite.copy")}</button>
        </div>
      )}
      <div className="flex flex-col">
        <strong className="pb-1">{t("invite.active")}</strong>
        {links.length === 0 && <span className="text-sm text-muted">{t("invite.none")}</span>}
        {links.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
            <span>{t(`roles.${l.role}` as "roles.admin")} · {l.max_uses ? t("invite.usedOf", { uses: l.uses, max: l.max_uses }) : t("invite.used", { uses: l.uses })} · {t("invite.expires", { date: dateTime(l.expires_at, locale) })}</span>
            <button type="button" disabled={pending} onClick={() => start(async () => { await revokeInviteLink(slug, l.id); router.refresh(); })} className="border-0 bg-transparent p-0 text-muted underline">{t("invite.revoke")}</button>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <strong>{t("invite.person")}</strong>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setSent(null); }} placeholder={t("invite.search")} aria-label={t("invite.search")} className={`${field.inputSm} max-w-[420px]`} />
        {hits && hits.length === 0 && <span className="text-sm text-muted">{t("invite.noHits")}</span>}
        {hits && hits.length > 0 && (
          <div className="flex max-w-[520px] flex-col gap-2">
            <label className={field.label}>{t("invite.message")}<input value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} className={field.inputSm} /></label>
            {hits.map((p) => (
              <span key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5">
                <span className="flex min-w-0 flex-col"><strong className="truncate">{p.name}</strong>{p.headline && <span className="truncate text-sm text-muted">{p.headline}</span>}</span>
                <button type="button" disabled={pending} onClick={() => invite(p)} className={`${chip(false)} h-9 font-bold`}>{t("invite.send")}</button>
              </span>
            ))}
          </div>
        )}
        {sent && <span role="status" className="text-sm font-bold">{t("invite.sent")} ({sent})</span>}
      </div>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
    </section>
  );
}
