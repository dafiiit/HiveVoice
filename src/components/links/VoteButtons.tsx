"use client";
import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { voteResource } from "@/lib/actions/links";
import { IconDown, IconUp } from "../ui/Icons";

/** Up and down vote. Voting again on the same arrow takes the vote back. */
export function VoteButtons({ id, score, mine, canVote }: { id: string; score: number; mine: number | null; canVote: boolean }) {
  const t = useTranslations("links");
  const [vote, setVote] = useOptimistic(mine ?? 0);
  const [, start] = useTransition();
  const shown = score - (mine ?? 0) + vote;
  const cast = (v: 1 | -1) => {
    if (!canVote) return;
    const next = vote === v ? 0 : v;
    start(async () => { setVote(next); await voteResource(id, next); });
  };
  return (
    <div role="group" aria-label={t("votes")} className="inline-flex items-center gap-1">
      <button type="button" aria-pressed={vote === 1} aria-label={t("up")} title={t("up")} onClick={() => cast(1)} disabled={!canVote}
        className={`inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 ${vote === 1 ? "font-bold text-ink" : "text-muted"}`}><IconUp /></button>
      <span className="tabular min-w-6 text-center text-sm font-bold" aria-live="polite">{shown}</span>
      <button type="button" aria-pressed={vote === -1} aria-label={t("down")} title={t("down")} onClick={() => cast(-1)} disabled={!canVote}
        className={`inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 ${vote === -1 ? "text-ink" : "text-muted"}`}><IconDown /></button>
    </div>
  );
}
