"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { decideEmergency, decideProposal, logDisclosure } from "@/lib/actions/admin";
import { relTime } from "@/lib/format";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

export type Queue = {
  proposals: { id: string; kind: string; reason: string | null; mine: boolean; at: string; subject: string }[];
  emergencies: { id: string; case_no: string; rule: string; type: string; note: string | null; at: string; text: string | null }[];
  admins: number;
  disclosures: { reference: string; authority: string; at: string }[];
};

/** What waits for a second admin, emergency reports, and the log of disclosures to authorities. */
export function AdminQueue({ q }: { q: Queue }) {
  const t = useTranslations("modrights.admin");
  const tr = useTranslations("report");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [ref, setRef] = useState(""), [authority, setAuthority] = useState(""), [scope, setScope] = useState("");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    setMsg(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    router.refresh();
  });
  return (
    <div className="flex flex-col gap-10">
      {q.admins < 2 && <Notice tone="warning">{t("only_one")}</Notice>}
      {msg && <p role="alert" className="m-0 font-bold">{msg}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("emergencies")}</h2>
        {q.emergencies.length === 0 && <p className="m-0 text-muted">{t("emergencyNone")}</p>}
        {q.emergencies.map((e) => (
          <article key={e.id} className="flex max-w-[760px] flex-col gap-2 border-2 border-red bg-surface p-4">
            <strong>{e.case_no} · {tr(`rules.${e.rule}.label` as "rules.illegal.label")} · {relTime(e.at, locale)}</strong>
            {e.text && <p className="m-0 whitespace-pre-line">{e.text}</p>}
            {e.note && <p className="m-0 text-sm text-muted">{e.note}</p>}
            <span className="text-sm">{t("emergencyText")}</span>
            <label className={field.label}>{t("reason")}<input value={reasons[e.id] ?? ""} onChange={(ev) => setReasons({ ...reasons, [e.id]: ev.target.value })} className={field.input} /></label>
            <span className="flex flex-wrap gap-2">
              <button type="button" disabled={pending || (reasons[e.id] ?? "").trim().length < 10} className={btn.red} onClick={() => act(() => decideEmergency(e.id, true, reasons[e.id]))}>{t("upheld")}</button>
              <button type="button" disabled={pending || (reasons[e.id] ?? "").trim().length < 10} className={btn.secondary} onClick={() => act(() => decideEmergency(e.id, false, reasons[e.id]))}>{t("dismissed")}</button>
            </span>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("queue")}</h2>
        {q.proposals.length === 0 && <p className="m-0 text-muted">{t("queueNone")}</p>}
        {q.proposals.map((p) => (
          <article key={p.id} className="flex max-w-[760px] flex-col gap-1 border border-line p-3">
            <strong>{t(`kind_${p.kind}` as "kind_ban")} · {p.subject}</strong>
            {p.reason && <span className="text-sm">{p.reason}</span>}
            {p.mine
              ? <span className="text-sm text-muted">{t("queueMine")}</span>
              : <span className="flex gap-2">
                  <button type="button" disabled={pending} className={btn.primary} onClick={() => act(() => decideProposal(p.id, true))}>{t("approve")}</button>
                  <button type="button" disabled={pending} className={btn.secondary} onClick={() => act(() => decideProposal(p.id, false))}>{t("reject")}</button>
                </span>}
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("disclosures")}</h2>
        <p className="m-0 max-w-[720px]">{t("disclosuresText")}</p>
        {q.disclosures.length === 0 && <p className="m-0 text-muted">{t("log_none")}</p>}
        {q.disclosures.map((d, i) => <span key={i} className="border-b border-line py-1 text-sm">{d.reference} · {d.authority} · {relTime(d.at, locale)}</span>)}
        <form className="flex max-w-[640px] flex-col gap-2" onSubmit={(e) => {
          e.preventDefault();
          act(async () => { const r = await logDisclosure(ref, authority, scope); if (r.ok) { setRef(""); setAuthority(""); setScope(""); } return r; });
        }}>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("reference")} aria-label={t("reference")} className={field.input} />
          <input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder={t("authority")} aria-label={t("authority")} className={field.input} />
          <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder={t("scope")} aria-label={t("scope")} className={field.input} />
          <button type="submit" disabled={pending} className={`${btn.secondary} self-start`}>{t("log")}</button>
        </form>
        <Link href="/transparenz" className="font-bold">{t("transparency")}</Link>
      </section>
    </div>
  );
}
