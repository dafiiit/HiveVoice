"use client";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { btn } from "./ui/styles";

const noop = () => () => {};

/** Pass something on: the system's share sheet when there is one, the link to copy, and a QR code to show. */
export function ShareButtons({ url, title, text }: { url: string; title: string; text: string }) {
  const t = useTranslations("growth.share");
  const canShare = useSyncExternalStore(noop, () => typeof navigator !== "undefined" && "share" in navigator, () => false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canShare && <button type="button" className={btn.primary} onClick={() => { void navigator.share({ title, text, url }).catch(() => {}); }}>{t("share")}</button>}
        <button type="button" className={canShare ? btn.secondary : btn.primary} onClick={async () => { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); }}>{copied ? t("copied") : t("copy")}</button>
        <button type="button" aria-expanded={qr} className={btn.secondary} onClick={() => setQr(!qr)}>{t("qr")}</button>
      </div>
      {qr && (
        <div className="flex flex-col items-start gap-2 border border-line bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/qr?u=${encodeURIComponent(url)}`} alt={t("qrAlt", { title })} width={220} height={220} className="block h-[220px] w-[220px]" />
          <span className="text-sm text-black">{t("qrHint")}</span>
        </div>
      )}
    </div>
  );
}
