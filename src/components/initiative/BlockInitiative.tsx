"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { blockInitiative } from "@/lib/actions/initiatives";
import { btn, field } from "../ui/styles";

/** Platform admins only: blocking needs a reason the authors can read; a vote that runs is called off. */
export function BlockInitiative({ id, blocked }: { id: string; blocked: boolean }) {
  const t = useTranslations("inirights.block");
  const tc = useTranslations("common");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState(false);
  const go = (on: boolean) => start(async () => {
    const res = await blockInitiative(id, reason, on);
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    if (res.ok) { setReason(""); setWaiting(res.data === "pending"); router.refresh(); }
  });
  const tm = useTranslations("modrights.admin");
  return (
    <section aria-label={t("title")} className="flex flex-col gap-2 border border-line p-4">
      <strong className="text-sm">{t("title")}</strong>
      {!blocked && <label className={field.label}>{t("reason")}<input value={reason} onChange={(e) => setReason(e.target.value)} className={field.inputSm} /></label>}
      <button type="button" disabled={pending || (!blocked && reason.trim().length < 10)} onClick={() => go(!blocked)} className={`${blocked ? btn.secondary : btn.red} self-start`}>{blocked ? t("unblock") : t("block")}</button>
      {waiting && <p role="status" className="m-0 text-sm font-bold">{tm("pending")}</p>}
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
    </section>
  );
}
