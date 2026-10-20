"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addDomain, purgeDemo, removeDomain, setDemoChats, setRegistrationMode, setVerificationMode } from "@/lib/actions/admin";
import { mintInviteCodes } from "@/lib/actions/growth";
import { btn, chip, field } from "../ui/styles";
import { ConfirmAction } from "../ui/Action";

type Overview = {
  profiles: number; demo_profiles: number; groups: number; initiatives: number; listings: number; open_ballots: number; open_cases: number; regions: number;
  settings: Record<string, unknown>; domains: { domain: string; label: string }[]; admins: { id: string; name: string }[];
};

export function AdminPanel({ o }: { o: Overview }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const tm = useTranslations("modrights.admin");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? ((r as { data?: unknown }).data === "pending" ? tm("pending") : ok ?? t("done")) : tc(`errors.${r.error}` as "errors.unknown"));
    router.refresh();
  });
  const mode = String(o.settings.verification_mode ?? "login");
  const regMode = String(o.settings.registration_mode ?? "open");
  const [minted, setMinted] = useState<string[]>([]);
  const tg = useTranslations("growth.admin");
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
        <h2 className="m-0 text-2xl font-bold">{tg("title")}</h2>
        <p className="m-0 max-w-[720px]">{tg("text")}</p>
        <div className="flex gap-2">
          {(["open", "invite"] as const).map((m) => <button key={m} type="button" aria-pressed={regMode === m} disabled={pending} onClick={() => act(() => setRegistrationMode(m))} className={chip(regMode === m)}>{tg(`mode_${m}`)}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} className={btn.secondary} onClick={() => start(async () => { const r = await mintInviteCodes(10); if (r.ok) setMinted(r.data); else setMsg(tc(`errors.${r.error}` as "errors.unknown")); })}>{tg("mint")}</button>
          <span className="text-sm text-muted">{tg("mintText")}</span>
        </div>
        {minted.length > 0 && <pre className="m-0 overflow-x-auto border border-line bg-surface p-3 text-sm">{minted.join("\n")}</pre>}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("domains")}</h2>
        <p className="m-0 max-w-[720px]">{t("domainsText")}</p>
        <div className="flex flex-col border-t border-line">
          {o.domains.map((d) => (
            <div key={d.domain} className="flex items-center gap-3 border-b border-line py-2">
              <strong className="flex-1">{d.domain}</strong><span className="text-sm text-muted">{d.label}</span>
              <button type="button" disabled={pending} onClick={() => act(() => removeDomain(d.domain))} className={`${btn.linkMuted} text-sm`}>{tc("delete")}</button>
            </div>
          ))}
          {o.domains.length === 0 && <p className="text-muted">{t("noDomains")}</p>}
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await addDomain(domain, label); if (r.ok) { setDomain(""); setLabel(""); } return r; }); }}>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="muenchen.de" aria-label={t("domain")} className={`${field.input} max-w-[240px]`} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} aria-label={t("label")} className={`${field.input} max-w-[280px]`} />
          <button type="submit" disabled={pending} className={btn.primary}>{t("addDomain")}</button>
        </form>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("admins")}</h2>
        {o.admins.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-line py-2">
            <strong className="flex-1">{a.name}</strong>
          </div>
        ))}
        <p className="m-0 max-w-[720px] text-sm text-muted">{t("adminsFromConfig")}</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("demo")}</h2>
        <p className="m-0 max-w-[720px]">{t("demoText", { n: o.demo_profiles })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <strong>{t("demoChats")}</strong>
          <button type="button" role="switch" aria-checked={demoChats} disabled={pending} onClick={() => act(() => setDemoChats(!demoChats))} className={chip(demoChats)}>{demoChats ? t("on") : t("off")}</button>
        </div>
        <p className="m-0 max-w-[720px] text-sm text-muted">{t("demoChatsText")}</p>
        <ConfirmAction disabled={pending || o.demo_profiles === 0} variant="red" className="self-start" question={t("demoConfirm")} onConfirm={() => act(() => purgeDemo(), t("demoRemoved"))} label={t("demoRemove")} />
      </section>
    </div>
  );
}
