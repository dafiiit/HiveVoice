"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { closePoll, deletePoll, votePoll } from "@/lib/actions/polls";
import { dateTime } from "@/lib/format";
import type { PollView } from "@/lib/files";

/**
 * A poll in a chat or post. Counts are open, who voted for what is not.
 * Voting again on your own answer takes the vote back.
 */
export function PollCard({ poll, canVote, signedIn, loginPath, onChange }: { poll: PollView; canVote: boolean; signedIn: boolean; loginPath: string; onChange?: (p: PollView) => void }) {
  const t = useTranslations("extras");
  const locale = useLocale();
  const [gone, setGone] = useState(false);
  // What the server just sent wins over my last answer: a fresh poll from props replaces the local copy.
  const [state, setState] = useState<{ base: PollView; local: PollView | null }>({ base: poll, local: null });
  if (state.base !== poll) setState({ base: poll, local: null });
  const shown = state.local ?? poll;
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const total = Math.max(1, shown.options.reduce((n, o) => n + o.votes, 0));
  const open = !shown.closed && canVote;

  const choose = (id: string) => {
    if (!open) return;
    const mine = shown.options.filter((o) => o.mine).map((o) => o.id);
    const next = shown.multiple ? (mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]) : mine.includes(id) ? [] : [id];
    setError(false);
    start(async () => {
      const res = await votePoll(shown.id, next);
      if (res.ok && res.data) { setState({ base: poll, local: res.data }); onChange?.(res.data); } else setError(true);
    });
  };

  if (gone) return null;
  return (
    <section aria-label={t("pollLabel", { question: shown.question })} className="flex w-full max-w-[420px] flex-col gap-2 border border-ink bg-surface p-3 text-ink">
      <strong className="break-words leading-snug">{shown.question}</strong>
      <span className="text-xs text-muted">{shown.closed ? t("pollClosed") : shown.multiple ? t("pollMany") : t("pollOne")}{shown.closes_at && !shown.closed ? ` · ${t("pollEnds", { date: dateTime(shown.closes_at, locale) })}` : ""}</span>
      <div role={shown.multiple ? "group" : "radiogroup"} aria-label={shown.question} className="flex flex-col gap-1.5">
        {shown.options.map((o) => {
          const pct = Math.round((100 * o.votes) / total);
          return (
            <button key={o.id} type="button" role={shown.multiple ? "checkbox" : "radio"} aria-checked={o.mine} disabled={!open || pending} onClick={() => choose(o.id)}
              className={`relative flex min-h-11 items-center justify-between gap-3 overflow-hidden border px-3 py-2 text-left ${o.mine ? "border-ink font-bold" : "border-line"} bg-surface text-ink disabled:cursor-default`}>
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${o.mine ? "bg-ink/20" : "bg-chip"}`} style={{ width: `${pct}%`, transition: "width 500ms var(--ease-out)" }} />
              <span className="relative min-w-0 break-words">{o.mine ? "✓ " : ""}{o.label}</span>
              <span className="tabular relative flex-none text-sm">{pct} %</span>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted">{t("pollVoters", { n: shown.voters })}</span>
      {!signedIn && !shown.closed && <Link href={`/login?next=${encodeURIComponent(loginPath)}`} className="text-sm font-bold">{t("pollSignIn")}</Link>}
      {signedIn && !canVote && !shown.closed && <span className="text-xs text-muted">{t("pollVerify")}</span>}
      {shown.can_manage && (
        <span className="flex gap-3 text-xs">
          {!shown.closed && <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-muted underline" onClick={() => start(async () => {
            const res = await closePoll(shown.id);
            if (res.ok && res.data) { setState({ base: poll, local: res.data }); onChange?.(res.data); } else setError(true);
          })}>{t("pollEnd")}</button>}
          <button type="button" disabled={pending} className="border-0 bg-transparent p-0 text-muted underline" onClick={() => { if (confirm(t("pollDeleteConfirm"))) start(async () => { const res = await deletePoll(shown.id); if (res.ok) setGone(true); else setError(true); }); }}>{t("pollDelete")}</button>
        </span>
      )}
      {error && <span role="alert" className="text-sm font-bold">{t("pollFailed")}</span>}
    </section>
  );
}
