"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { decideAuthorInvite } from "@/lib/actions/initiatives";
import { btn } from "../ui/styles";

/** Shown to a person who was asked to write along. */
export function AuthorInviteBanner({ id, inviteId, by, title }: { id: string; inviteId: string; by: string; title: string }) {
  const t = useTranslations("inirights.invited");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (accept: boolean) => start(async () => {
    const res = await decideAuthorInvite(id, inviteId, accept);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    router.refresh();
  });
  return (
    <div role="status" className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
      <strong>{t("title", { by, title })}</strong>
      <span className="text-sm">{t("text")}</span>
      <span className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => decide(true)} className={btn.primary}>{t("accept")}</button>
        <button type="button" disabled={pending} onClick={() => decide(false)} className={btn.secondary}>{t("decline")}</button>
      </span>
      {error && <span role="alert" className="text-sm font-bold">{error}</span>}
    </div>
  );
}
