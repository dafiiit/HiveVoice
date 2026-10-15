"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestDirect } from "@/lib/actions/messages";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";

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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("title", { name })} onClick={(e) => e.stopPropagation()} className="flex w-full max-w-[520px] flex-col gap-4 bg-surface p-6">
            <div className="flex items-center gap-3">
              <Avatar name={name} seed={seed} path={path} size={44} />
              <strong>{t("title", { name })}</strong>
            </div>
            <textarea rows={4} autoFocus aria-label={t("title", { name })} placeholder={t("placeholder")} value={msg} onChange={(e) => setMsg(e.target.value)} className={field.textarea} />
            <span className="text-sm text-muted">{t("privacy", { name })}</span>
            {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
            <div className="flex gap-3">
              <button type="button" disabled={pending || !msg.trim()} className={btn.primaryLg} onClick={() => start(async () => {
                const res = await requestDirect(toId, msg);
                if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
                router.push(res.data.conversation_id ? `/connect?c=d:${res.data.conversation_id}` : `/connect?c=c:${res.data.request_id}`);
              })}>{tc("send")}</button>
              <button type="button" onClick={() => setOpen(false)} className={btn.secondaryLg}>{tc("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
