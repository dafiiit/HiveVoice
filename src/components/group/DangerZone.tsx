"use client";

import { useLocale, useTranslations } from "next-intl";
import { archiveGroup, requestDeleteGroup } from "@/lib/actions/groups";
import { dateLong } from "@/lib/format";
import { btn } from "../ui/styles";
import { Notice } from "@/components/ui/Page";
import { useAction } from "../ui/Action";

/** Archive (admins), schedule deletion with a 14 day wait (owner), download the group's data (admins). */
export function DangerZone({ slug, groupId, archived, deleteRequestedAt, isOwner, isAdmin }: {
  slug: string; groupId: string; archived: boolean; deleteRequestedAt: string | null; isOwner: boolean; isAdmin: boolean;
}) {
  const t = useTranslations("grouprights.danger");
  const locale = useLocale();
  const { run: exec, pending, error } = useAction();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => exec(fn);
  const due = deleteRequestedAt ? new Date(new Date(deleteRequestedAt).getTime() + 14 * 86400000).toISOString() : null;
  return (
    <section aria-label={t("title")} className="flex flex-col gap-3 border-t-[6px] border-ink pt-4">
      <h2 className="m-0 text-2xl font-bold">{t("title")}</h2>
      {isAdmin && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm">{t("archiveText")}</span>
          <button type="button" disabled={pending} className={`${btn.secondary} self-start`} onClick={() => run(() => archiveGroup(slug, groupId, !archived))}>{archived ? t("unarchive") : t("archive")}</button>
        </div>
      )}
      {isAdmin && <a href={`/groups/${slug}/export`} className={`${btn.secondary} self-start`} download>{t("export")}</a>}
      {isOwner && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm">{t("deleteText")}</span>
          {due && <strong role="status" className="text-sm">{t("deleteDue", { date: dateLong(due, locale) })}</strong>}
          <button type="button" disabled={pending} className={`${deleteRequestedAt ? btn.secondary : btn.red} self-start`} onClick={() => run(() => requestDeleteGroup(slug, groupId, !deleteRequestedAt))}>{deleteRequestedAt ? t("cancelDelete") : t("delete")}</button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
