"use client";
import { useOptimistic, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { voteResource } from "@/lib/actions/links";
import { IconDown, IconUp } from "../ui/Icons";
import { Pop, Roll, usePulse } from "../ui/Vote";

const press = "inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 transition-transform duration-150 ease-out active:scale-90";

/** Up and down vote. Voting again on the same arrow takes the vote back. */
export function VoteButtons({ id, score, mine, canVote }: { id: string; score: number; mine: number | null; canVote: boolean }) {
  const t = useTranslations("links");
  const path = usePathname();
  const [vote, setVote] = useOptimistic(mine ?? 0);
  const [, start] = useTransition();
  const [pulse, ping] = usePulse();
  const shown = score - (mine ?? 0) + vote;
  const cast = (v: 1 | -1) => {
    if (!canVote) return;
    const next = vote === v ? 0 : v;
    ping(v, next !== 0);
    start(async () => { setVote(next); await voteResource(id, next, path); });
  };
  return (
    <div role="group" aria-label={t("votes")} className="inline-flex items-center gap-1">
      <button type="button" aria-pressed={vote === 1} aria-label={t("up")} title={t("up")} onClick={() => cast(1)} disabled={!canVote}
        className={`${press} ${vote === 1 ? "font-bold text-ink" : "text-muted"}`}><Pop arrow={1} pulse={pulse}><IconUp /></Pop></button>
      <Roll value={shown} className="min-w-6 justify-center text-sm font-bold" />
      <button type="button" aria-pressed={vote === -1} aria-label={t("down")} title={t("down")} onClick={() => cast(-1)} disabled={!canVote}
        className={`${press} ${vote === -1 ? "text-ink" : "text-muted"}`}><Pop arrow={-1} pulse={pulse}><IconDown /></Pop></button>
    </div>
  );
}
