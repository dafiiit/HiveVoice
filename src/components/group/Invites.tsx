"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createInviteLink, inviteMember, revokeInviteLink } from "@/lib/actions/groups";
import type { PersonHit } from "@/lib/actions/people";
import { PersonPicker } from "../ui/PersonPicker";
import { dateTime } from "@/lib/format";
import { btn, field } from "../ui/styles";
import { Notice, Section } from "@/components/ui/Page";
import { CopyField } from "../ui/Copy";

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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const url = (code: string) => `${window.location.origin}/einladung/${code}`;
  const make = () => start(async () => {
    const res = await createInviteLink(slug, groupId, role, days, maxUses);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setError(null); setFresh(url(res.data));
    router.refresh();
  });
  const invite = (p: PersonHit, clear: () => void) => start(async () => {
    const res = await inviteMember(slug, groupId, p.id, role, message);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setError(null); setSent(p.name); clear(); setMessage("");
  });

  return (
    <Section title={t("invite.title")} className="gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={field.label}>{t("invite.role")}
          <select value={role} onChange={(e) => setRole(e.target.value)} className={field.select}>
            {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}` as "roles.admin")}</option>)}
          </select>
        </label>
        <label className={field.label}>{t("invite.days")}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={field.select}>
            <option value={1}>{t("invite.d1")}</option><option value={7}>{t("invite.d7")}</option><option value={30}>{t("invite.d30")}</option>
          </select>
        </label>
        <label className={field.label}>{t("invite.uses")}
          <select value={maxUses ?? ""} onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)} className={field.select}>
            <option value="">{t("invite.usesAny")}</option><option value={1}>{t("invite.uses1")}</option><option value={5}>{t("invite.uses5")}</option><option value={25}>{t("invite.uses25")}</option>
          </select>
        </label>
        <button type="button" disabled={pending} onClick={make} className={btn.primary}>{t("invite.create")}</button>
      </div>
      {fresh && <div role="status" className="border border-ink bg-surface p-3"><CopyField value={fresh} label={t("invite.linkTitle")} copyLabel={t("invite.copy")} /></div>}
      <div className="flex flex-col">
        <strong className="pb-1">{t("invite.active")}</strong>
        {links.length === 0 && <span className="text-sm text-muted">{t("invite.none")}</span>}
        {links.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
            <span>{t(`roles.${l.role}` as "roles.admin")} · {l.max_uses ? t("invite.usedOf", { uses: l.uses, max: l.max_uses }) : t("invite.used", { uses: l.uses })} · {t("invite.expires", { date: dateTime(l.expires_at, locale) })}</span>
            <button type="button" disabled={pending} onClick={() => start(async () => { await revokeInviteLink(slug, l.id); router.refresh(); })} className={btn.linkMuted}>{t("invite.revoke")}</button>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <strong>{t("invite.person")}</strong>
        <label className={`${field.label} max-w-[520px]`}>{t("invite.message")}<input value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} className={field.input} /></label>
        <PersonPicker filter={{ kind: "notInGroup", groupId }} label={t("invite.search")} placeholder={t("invite.search")} disabled={pending}
          action={(p, clear) => <button type="button" disabled={pending} onClick={() => invite(p, clear)} className={btn.secondarySm}>{t("invite.send")}</button>} />
        {sent && <span role="status" className="text-sm font-bold">{t("invite.sent")} ({sent})</span>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </Section>
  );
}
