"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { appealReport } from "@/lib/actions/reports";
import { ReasonDialog } from "../ui/Dialog";

/** Einspruch: once, within two weeks, heard by a different jury. */
export function Appeal({ reportId, days }: { reportId: string; days: number }) {
  const t = useTranslations("modrights.mine");
  const router = useRouter();
  return (
    <ReasonDialog label={t("appealButton")} title={t("appealButton")} reasonLabel={t("appealReason")} hint={t("appealHint", { days })} sendLabel={t("appealSend")}
      size="sm" className="self-start"
      onSend={async (reason) => { const res = await appealReport(reportId, reason); if (res.ok) router.refresh(); return res; }} />
  );
}
