"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirmResponsibility, recommendResponsibility } from "@/lib/actions/responsible";
import { btn, field } from "../ui/styles";

/** People of the place confirm a declaration; the admin of a group of the place may recommend it. */
export function ConfirmButton({ id, count, min, mine, affected, groups, endorsed }: {
  id: string; count: number; min: number; mine: boolean; affected: boolean; groups: { id: string; name: string }[]; endorsed: number;
}) {
  const t = useTranslations("resprights.confirm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState(groups[0]?.id ?? "");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    router.refresh();
  });
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{t("count", { n: count, min })}{endorsed > 0 ? ` · ${t("groups", { n: endorsed })}` : ""}</span>
      <span className="flex flex-wrap items-center gap-2">
        {affected && (
          <button type="button" disabled={pending} aria-pressed={mine} className={mine ? btn.secondary : btn.primary} onClick={() => act(() => confirmResponsibility(id, !mine))}>
            {mine ? t("undo") : t("button")}
          </button>
        )}
        {groups.length > 0 && (
          <>
            <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t("recommendPick")} className={`${field.select} h-10`}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => act(() => recommendResponsibility(id, group, true))}>{t("recommend")}</button>
          </>
        )}
      </span>
      {!affected && <span className="text-muted">{t("notAffected")}</span>}
      {error && <span role="alert" className="font-bold">{error}</span>}
    </div>
  );
}
