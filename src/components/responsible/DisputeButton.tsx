"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { disputeResponsibility } from "@/lib/actions/responsible";
import { ReasonDialog } from "../ui/Dialog";
import { btn } from "../ui/styles";

/** Somebody says the declaration is wrong: 14 days for evidence, then seven people from the region decide. */
export function DisputeButton({ id, days }: { id: string; days: number }) {
  const t = useTranslations("resprights.dispute");
  const router = useRouter();
  return (
    <ReasonDialog label={t("button")} title={t("button")} reasonLabel={t("label")} hint={t("help", { days })} sendLabel={t("send")}
      look={`${btn.linkMuted} self-start text-sm`}
      onSend={async (claim) => { const res = await disputeResponsibility(id, claim); if (res.ok) router.push(`/responsible/dispute/${res.data}`); return res; }} />
  );
}
