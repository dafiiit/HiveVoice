"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createInviteCode } from "@/lib/actions/growth";
import { Dialog } from "../ui/Dialog";
import { CopyButton } from "../ui/Copy";
import { IconMail, IconPlus } from "../ui/Icons";
import { Notice } from "../ui/Page";
import { btn } from "../ui/styles";

const noop = () => () => {};

/**
 * "+" next to Personen: bring people one knows onto the platform through WhatsApp, mail, SMS,
 * Telegram or the system's share sheet. While sign-up needs a code, a personal link with a code can be made.
 */
export function InviteFriends({ origin, codesLeft }: { origin: string; codesLeft: number | null }) {
  const t = useTranslations("growth.friends");
  const tc = useTranslations("common");
  const canShare = useSyncExternalStore(noop, () => typeof navigator !== "undefined" && "share" in navigator, () => false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(origin);
  const [left, setLeft] = useState(codesLeft);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [qr, setQr] = useState(false);

  const text = t("message");
  const full = `${text} ${url}`;
  const channels = [
    { key: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(full)}` },
    { key: "telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { key: "sms", href: `sms:?&body=${encodeURIComponent(full)}` },
  ] as const;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={t("title")} className={`${btn.primarySm} ml-auto`}><IconPlus size={14} /> {t("button")}</button>
      {open && (
        <Dialog title={t("title")} onClose={() => setOpen(false)}>
          <p className="m-0">{t("lead")}</p>
          <div className="grid grid-cols-2 gap-2">
            {channels.map((c) => (
              <a key={c.key} href={c.href} target="_blank" rel="noopener noreferrer" className={btn.secondary}>{t(c.key)}</a>
            ))}
            <a href={`mailto:?subject=${encodeURIComponent(t("subject"))}&body=${encodeURIComponent(full)}`} className={`${btn.secondary} gap-2`}><IconMail size={16} /> {t("email")}</a>
          </div>
          <div className="flex flex-wrap gap-2">
            {canShare && <button type="button" className={btn.primary} onClick={() => { void navigator.share({ title: "HiveVoice", text, url }).catch(() => {}); }}>{t("more")}</button>}
            <CopyButton text={full} label={t("copy")} variant={canShare ? "secondary" : "primary"} />
            <button type="button" aria-expanded={qr} className={btn.secondary} onClick={() => setQr(!qr)}>{t("qr")}</button>
          </div>
          {qr && (
            <div className="flex flex-col items-start gap-2 border border-line bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/qr?u=${encodeURIComponent(url)}`} alt={t("qr")} width={220} height={220} className="block h-[220px] w-[220px]" />
              <span className="text-sm text-black">{t("qrHint")}</span>
            </div>
          )}
          {/* Only while sign-up needs a code: a personal link lets the person start right away. */}
          {left !== null && url === origin && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="text-sm">{left > 0 ? t("codeText", { n: left }) : t("codeNone")}</span>
              {left > 0 && (
                <button type="button" disabled={pending} className={`${btn.secondarySm} self-start`} onClick={async () => {
                  setPending(true);
                  const res = await createInviteCode();
                  setPending(false);
                  if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
                  setUrl(`${origin}/einladung/${res.data}`); setLeft(left - 1); setError(null);
                }}>{t("code")}</button>
              )}
            </div>
          )}
          {url !== origin && <Notice tone="status">{t("codeMade")}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Link href="/sharing" className="text-sm text-muted" onClick={() => setOpen(false)}>{t("all")}</Link>
        </Dialog>
      )}
    </>
  );
}
