"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addDomain, grantAdmin, purgeDemo, removeDomain, setDemoChats, setVerificationMode } from "@/lib/actions/admin";
import { btn, chip, field } from "../ui/styles";

type Overview = {
  profiles: number; demo_profiles: number; groups: number; initiatives: number; listings: number; open_ballots: number; open_cases: number; regions: number;
  settings: Record<string, unknown>; domains: { domain: string; label: string }[]; admins: { id: string; name: string }[];
};

export function AdminPanel({ o, me }: { o: Overview; me: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const tm = useTranslations("modrights.admin");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? ((r as { data?: unknown }).data === "pending" ? tm("pending") : ok ?? t("done")) : tc(`errors.${r.error}` as "errors.unknown"));
    router.refresh();
  });
  const mode = String(o.settings.verification_mode ?? "login");
  const demoChats = o.settings.demo_chats === true;
  const stats: [string, number][] = [["profiles", o.profiles], ["demo_profiles", o.demo_profiles], ["groups", o.groups], ["initiatives", o.initiatives],
    ["listings", o.listings], ["open_ballots", o.open_ballots], ["open_cases", o.open_cases], ["regions", o.regions]];
  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
        {stats.map(([k, v]) => <div key={k} className="flex flex-col gap-1 bg-surface p-4"><span className="text-sm text-muted">{t(`stats.${k}`)}</span><strong className="tabular text-3xl">{v}</strong></div>)}
      </section>
      {msg && <p role="status" className="m-0 font-bold">{msg}</p>}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("verification")}</h2>
        <p className="m-0 max-w-[720px]">{t("verificationText")}</p>
        <div className="flex gap-2">
          {(["login", "vouch", "eid"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} disabled={pending} onClick={() => act(() => setVerificationMode(m))} className={chip(mode === m)}>{t(`modes.${m}`)}</button>)}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("domains")}</h2>
        <p className="m-0 max-w-[720px]">{t("domainsText")}</p>
        <div className="flex flex-col border-t border-line">
          {o.domains.map((d) => (
            <div key={d.domain} className="flex items-center gap-3 border-b border-line py-2">
              <strong className="flex-1">{d.domain}</strong><span className="text-sm text-muted">{d.label}</span>
              <button type="button" disabled={pending} onClick={() => act(() => removeDomain(d.domain))} className="border-0 bg-transparent text-sm text-muted underline">{tc("delete")}</button>
            </div>
          ))}
          {o.domains.length === 0 && <p className="text-muted">{t("noDomains")}</p>}
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await addDomain(domain, label); if (r.ok) { setDomain(""); setLabel(""); } return r; }); }}>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="muenchen.de" aria-label={t("domain")} className={`${field.inputSm} max-w-[240px]`} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} aria-label={t("label")} className={`${field.inputSm} max-w-[280px]`} />
          <button type="submit" disabled={pending} className={btn.primary}>{t("addDomain")}</button>
        </form>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("admins")}</h2>
        {o.admins.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-line py-2">
            <strong className="flex-1">{a.name}</strong>
            {a.id !== me && <button type="button" disabled={pending} onClick={() => act(() => grantAdmin(a.id, false))} className="border-0 bg-transparent text-sm text-muted underline">{t("revoke")}</button>}
          </div>
        ))}
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await grantAdmin(ref, true); if (r.ok) setRef(""); return r; }); }}>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("profilePlaceholder")} aria-label={t("profileRef")} className={`${field.inputSm} max-w-[420px]`} />
          <button type="submit" disabled={pending} className={btn.primary}>{t("grant")}</button>
        </form>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("demo")}</h2>
        <p className="m-0 max-w-[720px]">{t("demoText", { n: o.demo_profiles })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <strong>{t("demoChats")}</strong>
          <button type="button" role="switch" aria-checked={demoChats} disabled={pending} onClick={() => act(() => setDemoChats(!demoChats))} className={chip(demoChats)}>{demoChats ? t("on") : t("off")}</button>
        </div>
        <p className="m-0 max-w-[720px] text-sm text-muted">{t("demoChatsText")}</p>
        <button type="button" disabled={pending || o.demo_profiles === 0} onClick={() => { if (confirm(t("demoConfirm"))) act(() => purgeDemo(), t("demoRemoved")); }} className={`${btn.red} self-start`}>{t("demoRemove")}</button>
      </section>
    </div>
  );
}

export function ClaimAdmin() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { const { claimAdmin } = await import("@/lib/actions/admin"); await claimAdmin(); router.refresh(); })} className={btn.primaryLg}>{t("claim")}</button>
  );
}
