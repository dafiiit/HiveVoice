"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteResource } from "@/lib/actions/links";
import { ConfirmAction } from "../ui/Action";
import { btn } from "../ui/styles";

/** Not deleted at once: the document waits 30 days in the trash. */
export function DeleteLink({ id, groupSlug, home }: { id: string; groupSlug: string | null; home: string }) {
  const t = useTranslations("docrights.page");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ConfirmAction disabled={pending} look={`${btn.linkMuted} text-sm`} question={t("trashConfirm", { days: 30 })} onConfirm={() => start(async () => { await deleteResource(id); router.push(groupSlug ? `/groups/${groupSlug}?tab=links` : home); router.refresh(); })} label={t("trash")} />
  );
}
