"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { acceptInviteLink } from "@/lib/actions/groups";
import { btn } from "../ui/styles";

export function AcceptInvite({ code }: { code: string }) {
  const t = useTranslations("grouprights.join_page");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending} className={`${btn.primaryLg} self-start`}
        onClick={() => start(async () => {
          const res = await acceptInviteLink(code);
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          router.push(`/groups/${res.data}`);
        })}>{t("accept")}</button>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
    </div>
  );
}
