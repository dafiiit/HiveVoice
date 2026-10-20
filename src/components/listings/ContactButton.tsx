"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { requestContact } from "@/lib/actions/listings";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";
import { Dialog } from "../ui/Dialog";

/** Opens a short message to the owner. Contact details are only shared once they accept. */
export function ContactButton({ listingId, ownerName, ownerSeed, ownerPath, title, price, label, signedIn, sent: initiallySent, className, mine = [], via: initialVia }: {
  listingId: string; ownerName: string; ownerSeed?: number; ownerPath?: string | null; title: string; price: string; label: string; signedIn: boolean; sent?: boolean; className?: string;
  /** The viewer's own listings of the other kind: the request can say which of them it fits. */
  mine?: { id: string; title: string }[]; via?: string | null;
}) {
  const t = useTranslations("listings");
  const tc = useTranslations("common");
  const tcn = useTranslations("connect");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(!!initiallySent);
  const [msg, setMsg] = useState("");
  const [via, setVia] = useState(initialVia ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) return <Link href="/login" className={className ?? btn.primary}>{label}</Link>;
  if (sent) {
    return (
      <span role="status" className="flex flex-wrap items-center gap-x-3 text-sm">
        <strong>{t("requested")}</strong>
        <Link href={requestId ? `/friends?c=c:${requestId}` : "/friends?f=requests"} className="text-ink underline">{tcn("dm.seeInConnect")}</Link>
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => { setMsg(t("defaultMessage")); setOpen(true); }} className={className ?? btn.primary}>{label}</button>
      {open && (
        <Dialog title={t("contactTitle")} onClose={() => setOpen(false)}>
            <div className="flex items-center gap-3">
              <Avatar name={ownerName} seed={ownerSeed} path={ownerPath} size={40} />
              <div className="flex min-w-0 flex-col">
                <strong>{t("to", { name: ownerName })}</strong>
                <span className="text-sm text-muted">{title} · {price}</span>
              </div>
            </div>
            {mine.length > 0 && (
              <label className="flex flex-col gap-1.5 text-sm font-bold">{t("via")}
                <select value={via} onChange={(e) => setVia(e.target.value)} className={field.select}>
                  <option value="">{t("viaNone")}</option>
                  {mine.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </label>
            )}
            <textarea rows={4} aria-label={t("message")} value={msg} onChange={(e) => setMsg(e.target.value)} className={field.textarea} />
            <span className="text-sm text-muted">{t("privacy", { name: ownerName })}</span>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex gap-3">
              <button type="button" disabled={pending || !msg.trim()} onClick={() => start(async () => {
                const res = await requestContact(listingId, msg, via || null);
                if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
                setRequestId(res.data); setSent(true); setOpen(false);
              })} className={btn.primary}>{tc("send")}</button>
              <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
            </div>
        </Dialog>
      )}
    </>
  );
}
