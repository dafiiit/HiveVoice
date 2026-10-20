"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { explainAction } from "@/lib/actions/rights";
import { btn } from "./ui/styles";

/** "Why can't I?" under something that is not possible: asks the rule and names the reason and the next step. */
export function WhyNot({ action, objectId, className }: { action: string; objectId: string | null; className?: string }) {
  const t = useTranslations("rights");
  const [reason, setReason] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className={className ?? "flex flex-col items-start gap-1 text-sm"}>
      {reason === null ? (
        <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => start(async () => {
          const res = await explainAction(action, objectId);
          setReason(res.ok ? res.data.reason ?? "ok" : res.error);
        })}>{t("whyNot")}</button>
      ) : (
        <span role="status" className="font-bold">{reason === "ok" ? t("status.ok") : t.has(`why.${reason}`) ? t(`why.${reason}` as "why.not_found") : t("why.not_allowed")}
          {" "}<Link href="/rights" className="font-normal">{t("more")}</Link></span>
      )}
    </span>
  );
}
