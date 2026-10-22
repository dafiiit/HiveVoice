"use client";
import { useLocale, useTranslations } from "next-intl";
import { relTime } from "@/lib/format";
import type { Draft } from "@/lib/drafts";
import { btn } from "./styles";

/** Above a form whose unsaved input came back from the device: when it was written, and a way to start over. */
export function DraftNotice({ draft, className = "" }: { draft: Draft; className?: string }) {
  const t = useTranslations("common.draft");
  const locale = useLocale();
  if (!draft.restoredAt) return null;
  return (
    <p role="status" className={`m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 border-ink bg-surface px-3 py-2 text-sm ${className}`}>
      <span>{t("restored", { when: relTime(new Date(draft.restoredAt), locale) })}</span>
      <button type="button" onClick={draft.discard} className={btn.link}>{t("discard")}</button>
    </p>
  );
}
