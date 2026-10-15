"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteResource } from "@/lib/actions/links";

export function DeleteLink({ id, groupSlug }: { id: string; groupSlug: string | null }) {
  const t = useTranslations("links");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-sm text-muted underline"
      onClick={() => { if (confirm(t("deleteConfirm"))) start(async () => { await deleteResource(id); router.push(groupSlug ? `/groups/${groupSlug}?tab=links` : "/explore?kind=links"); }); }}>{t("delete")}</button>
  );
}
