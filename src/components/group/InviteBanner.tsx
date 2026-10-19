"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { decideInvite } from "@/lib/actions/groups";
import { btn } from "../ui/styles";

/** Shown to a person who was invited to this group. */
export function InviteBanner({ requestId, by }: { requestId: string; by: string; slug: string }) {
  const t = useTranslations("grouprights");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (accept: boolean) => start(async () => {
    const res = await decideInvite(requestId, accept);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    if (accept) router.refresh(); else router.push("/connect");
  });
  return (
    <div role="status" className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
      <strong>{t("invitedBy", { name: by })}</strong>
      <span className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => decide(true)} className={btn.primary}>{t("inviteAccept")}</button>
        <button type="button" disabled={pending} onClick={() => decide(false)} className={btn.secondary}>{t("inviteDecline")}</button>
      </span>
      {error && <span role="alert" className="text-sm font-bold">{error}</span>}
    </div>
  );
}
