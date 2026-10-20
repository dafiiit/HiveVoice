"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestDirect } from "@/lib/actions/messages";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";
import { Dialog } from "../ui/Dialog";

/** Write to someone from their profile. The first message arrives as a request they can accept. */
export function MessageButton({ toId, name, seed, path, signedIn }: { toId: string; name: string; seed: number; path: string | null; signedIn: boolean }) {
  const t = useTranslations("connect.dm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) return <Link href="/login" className={btn.secondary}>{t("button")}</Link>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>{t("button")}</button>
      {open && (
        <Dialog title={t("title", { name })} onClose={() => setOpen(false)}>
            <span className="flex items-center gap-3"><Avatar name={name} seed={seed} path={path} size={40} /><strong>{name}</strong></span>
            <textarea rows={4} autoFocus aria-label={t("title", { name })} placeholder={t("placeholder")} value={msg} onChange={(e) => setMsg(e.target.value)} className={field.textarea} />
            <span className="text-sm text-muted">{t("privacy", { name })}</span>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex gap-3">
              <button type="button" disabled={pending || !msg.trim()} className={btn.primary} onClick={() => start(async () => {
                const res = await requestDirect(toId, msg);
                if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
                router.push(res.data.conversation_id ? `/friends?c=d:${res.data.conversation_id}` : `/friends?c=c:${res.data.request_id}`);
              })}>{tc("send")}</button>
              <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
            </div>
        </Dialog>
      )}
    </>
  );
}
