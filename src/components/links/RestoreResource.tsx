"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { restoreResource } from "@/lib/actions/links";
import { btn } from "../ui/styles";

/** Shown to the owner of a document that is in the trash. */
export function RestoreResource({ id }: { id: string }) {
  const t = useTranslations("docrights.docs");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-l-4 border-red bg-surface p-4">
      <strong>{t("trash")}</strong>
      <button type="button" disabled={pending} className={btn.secondary} onClick={() => start(async () => { await restoreResource(id); router.refresh(); })}>{t("restore")}</button>
    </div>
  );
}
