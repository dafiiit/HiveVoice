"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { blockProfile, setPrivacy } from "@/lib/actions/safety";
import { chip } from "../ui/styles";

type Findable = "all" | "members" | "groups";
type Contact = "all" | "verified" | "groups" | "none";

/** Who may find me and who may write to me, and the people I blocked. */
export function PrivacySettings({ findable, contactFrom, minor, blocked }: { findable: Findable; contactFrom: Contact; minor: boolean; blocked: { id: string; name: string }[] }) {
  const t = useTranslations("safety.privacy");
  const tc = useTranslations("common");
  const router = useRouter();
  const [f, setF] = useState(findable);
  const [c, setC] = useState(contactFrom);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (nf: Findable, nc: Contact) => start(async () => {
    const res = await setPrivacy({ findable: nf, contactFrom: nc });
    setMsg(res.ok ? t("saved") : tc(`errors.${res.error}` as "errors.unknown"));
    if (res.ok) { setF(nf); setC(nc); } 
    router.refresh();
  });
  const group = (label: string, values: readonly string[], current: string, key: "findable" | "contact", pick: (v: string) => void) => (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <strong>{label}</strong>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={current === v} disabled={pending} onClick={() => pick(v)} className={chip(current === v)}>
            {t(`${key}.${v}` as "findable.all")}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <section aria-label={t("title")} className="flex max-w-[760px] flex-col gap-4 border-b border-line pb-6">
      <h2 className="m-0 text-xl font-bold">{t("title")}</h2>
      {group(t("findableLabel"), ["all", "members", "groups"], f, "findable", (v) => save(v as Findable, c))}
      {group(t("contactLabel"), ["all", "verified", "groups", "none"], c, "contact", (v) => save(f, v as Contact))}
      <p className="m-0 text-sm text-muted">{t("contactHint")}{minor ? ` ${t("minor")}` : ""}</p>
      {msg && <p role="status" className="m-0 text-sm font-bold">{msg}</p>}
      <div className="flex flex-col gap-2">
        <strong>{t("blockedTitle")}</strong>
        {blocked.length === 0 && <span className="text-sm text-muted">{t("noBlocked")}</span>}
        {blocked.map((b) => (
          <span key={b.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5">
            <span>{b.name}</span>
            <button type="button" disabled={pending} onClick={() => start(async () => { await blockProfile(b.id, false); router.refresh(); })} className="border-0 bg-transparent p-0 text-sm text-ink underline">{t("unblock")}</button>
          </span>
        ))}
      </div>
    </section>
  );
}
