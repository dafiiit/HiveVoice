"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createInviteCode, redeemInviteCode, revokeInviteCode } from "@/lib/actions/growth";
import { dateLong } from "@/lib/format";
import { btn, field } from "../ui/styles";
import { CopyButton } from "../ui/Copy";

export type CodeRow = { code: string; used: boolean; expires_at: string; revoked: boolean };

/** Own invitation codes: make, copy as a link, withdraw. */
export function InviteCodes({ codes, left, origin }: { codes: CodeRow[]; left: number; origin: string }) {
  const t = useTranslations("growth.invite");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm">{left > 0 ? t("left", { n: left }) : t("leftNone")}</span>
      <button type="button" disabled={pending || left < 1} className={`${btn.primary} self-start`} onClick={() => start(async () => {
        const res = await createInviteCode();
        setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
        router.refresh();
      })}>{t("create")}</button>
      {codes.length === 0 && <span className="text-sm text-muted">{t("none")}</span>}
      {codes.map((c) => (
        <div key={c.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
          <span className="flex flex-col"><strong className="tabular tracking-wider">{c.code}</strong>
            <span className="text-muted">{c.used ? t("used") : t("expires", { date: dateLong(c.expires_at, locale) })}</span></span>
          {!c.used && (
            <span className="flex gap-3">
              <CopyButton text={`${origin}/einladung/${c.code}`} label={t("copyLink")} size="sm" />
              <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => start(async () => { await revokeInviteCode(c.code); router.refresh(); })}>{t("revoke")}</button>
            </span>
          )}
        </div>
      ))}
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
    </div>
  );
}

/** Somebody who joined without a code types it here. */
export function RedeemCode({ initial = "" }: { initial?: string }) {
  const t = useTranslations("growth.invite");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p role="status" className="m-0 font-bold">{t("redeemed")}</p>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await redeemInviteCode(code);
        if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
        setDone(true); router.refresh();
      });
    }}>
      <label className={field.label}>{t("redeemTitle")}
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} placeholder={t("redeemPlaceholder")} className={`${field.input} w-56 tracking-wider`} />
      </label>
      <button type="submit" disabled={pending || code.trim().length < 10} className={btn.primary}>{t("redeem")}</button>
      {error && <p role="alert" className="m-0 w-full font-bold">{error}</p>}
    </form>
  );
}
