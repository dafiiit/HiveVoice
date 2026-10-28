"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateGroup } from "@/lib/actions/groups";
import { field, segment, segments } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

/** Visibility, who may join, adults only and slow mode: changes are logged, and openings are announced to the members. */
export function GroupRules({ slug, groupId, visibility, joinPolicy, adultsOnly, slowMode, adminsManageInitiatives }: { slug: string; groupId: string; visibility: string; joinPolicy: string; adultsOnly: boolean; slowMode: number; adminsManageInitiatives: boolean }) {
  const t = useTranslations("grouprights");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const radio = segment;
  const set = (input: Parameters<typeof updateGroup>[2]) => start(async () => {
    const res = await updateGroup(slug, groupId, input);
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    router.refresh();
  });
  return (
    <section aria-label={t("rules.title")} className="flex flex-col gap-4">
      <h2 className="m-0 text-2xl font-bold">{t("rules.title")}</h2>
      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label={t("vis.public")} className={`${segments} flex-wrap`}>
          {(["public", "members", "secret"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={visibility === v} disabled={pending} className={radio(visibility === v)} onClick={() => set({ visibility: v })}>{t(`vis.${v}`)}</button>
          ))}
        </div>
        <span className="text-sm text-muted">{t(`vis.${visibility}Text` as "vis.publicText")}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label={t("join.open")} className={`${segments} flex-wrap`}>
          {(["open", "request", "invite"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={joinPolicy === v} disabled={pending} className={radio(joinPolicy === v)} onClick={() => set({ joinPolicy: v })}>{t(`join.${v}`)}</button>
          ))}
        </div>
        <span className="text-sm text-muted">{t(`join.${joinPolicy}Text` as "join.openText")}</span>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={adultsOnly} disabled={pending} onChange={() => set({ adultsOnly: !adultsOnly })} className="h-6 w-6 accent-[var(--ink)]" />{t("rules.adults")}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={adminsManageInitiatives} disabled={pending} onChange={() => set({ adminsManageInitiatives: !adminsManageInitiatives })} className="h-6 w-6 accent-[var(--ink)]" />{t("rules.initiatives")}</label>
      <label className="flex flex-wrap items-center gap-3"><span className="font-bold">{t("rules.slow")}</span>
        <select value={slowMode} disabled={pending} onChange={(e) => set({ slowMode: Number(e.target.value) })} className={field.select}>
          <option value={0}>{t("rules.slowOff")}</option><option value={10}>{t("rules.slow10")}</option><option value={60}>{t("rules.slow60")}</option><option value={300}>{t("rules.slow300")}</option>
        </select>
        <span className="text-sm text-muted">{t("rules.slowHint")}</span>
      </label>
      <span className="text-sm text-muted">{t("rules.announce")}</span>
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
