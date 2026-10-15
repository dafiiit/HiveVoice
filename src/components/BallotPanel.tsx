"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { castVote } from "@/lib/actions/ballots";
import { dateTime, daysUntil } from "@/lib/format";
import { Glyph } from "./ui/Glyph";
import { btn } from "./ui/styles";

export type BallotView = {
  id: string;
  question: string;
  status: "open" | "closed" | "cancelled";
  closes_at: string;
  quorum_pct: number;
  subject_type: "initiative" | "goal";
  result: null | {
    segments: Record<string, Record<string, number>>;
    main_segment: string;
    voters: number;
    eligible: number;
    turnout_pct: number;
    passed: boolean;
  };
};

type Turnout = { voters: Record<string, number> | null; eligible: number | null } | null;

const OPTIONS = [
  { k: "yes", shape: "circle", rot: 0 },
  { k: "no", shape: "plus", rot: 45 },
  { k: "abstain", shape: "pill", rot: 0 },
] as const;

export function BallotPanel({ ballot, voted, segment, turnout, signedIn, canVote, path, pro, contra, compact }: {
  ballot: BallotView;
  voted: boolean;
  segment: string | null;
  turnout: Turnout;
  signedIn: boolean;
  canVote: boolean;
  path: string;
  pro: string[];
  contra: string[];
  compact?: boolean;
}) {
  const t = useTranslations("ballot");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [choice, setChoice] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [justVoted, setJustVoted] = useState(false);
  const router = useRouter();
  voted = voted || justVoted;
  const open = ballot.status === "open" && new Date(ballot.closes_at) > new Date();
  const main = ballot.subject_type === "goal" ? "member" : "affected";
  const mainVoters = turnout?.voters?.[main] ?? 0;
  const eligible = turnout?.eligible ?? 0;
  const turnoutPct = eligible ? Math.round((100 * mainVoters) / eligible) : 0;
  const other = turnout?.voters?.external ?? 0;

  const submit = () => start(async () => {
    const res = await castVote(ballot.id, choice as "yes", path);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setSheet(false); setChanging(false); setError(null); setJustVoted(true);
    router.refresh();
  });

  const results = ballot.result;
  const seg = (k: string) => results?.segments?.[k] ?? {};
  const pctOf = (k: string, c: string) => {
    const s = seg(k); const total = (s.yes ?? 0) + (s.no ?? 0) + (s.abstain ?? 0);
    return total ? Math.round((100 * (s[c] ?? 0)) / total) : 0;
  };

  return (
    <div className={`grid gap-8 ${compact ? "" : "2xl:grid-cols-[minmax(0,1fr)_340px]"}`}>
      <section aria-label={t("cast")} className="flex flex-col gap-5">
        {!compact && <h2 className="m-0 text-2xl font-bold leading-tight">{ballot.question}</h2>}
        {open && signedIn && segment && (
          <p className="m-0">{t(`segment.${segment}`)}</p>
        )}
        {open && !signedIn && (
          <p className="m-0"><Link href={`/login?next=${encodeURIComponent(path)}`} className="font-bold">{tc("signInToWrite")}</Link></p>
        )}
        {open && signedIn && !canVote && <p className="m-0 text-muted">{t("notAllowed")}</p>}

        {open && canVote && (!voted || changing) && !sheet && (
          <>
            <div role="radiogroup" aria-label={t("options")} className="grid gap-2 md:grid-cols-3">
              {OPTIONS.map((o) => (
                <button key={o.k} type="button" role="radio" aria-checked={choice === o.k} onClick={() => setChoice(o.k)}
                  className={`flex flex-col items-start gap-3 p-4 text-left ${choice === o.k ? "bg-ink text-on-ink" : "border border-line bg-surface text-ink"}`}>
                  <Glyph shape={o.shape} size={32} rotate={o.rot} color={choice === o.k ? "var(--on-ink)" : "var(--ink)"} />
                  <strong className="text-xl">{t(`choice.${o.k}`)}</strong>
                  <span className="text-sm">{t(`choiceHint.${o.k}`)}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" disabled={!choice} onClick={() => (pro.length || contra.length ? setSheet(true) : submit())} className={btn.primaryLg}>{tc("next")}</button>
              <span className="flex items-center gap-2 text-sm"><Glyph shape="keyhole" size={16} /> {t("secret")}</span>
            </div>
          </>
        )}

        {open && sheet && (
          <div role="dialog" aria-label={t("before")} className="flex flex-col gap-4 border-2 border-ink bg-surface p-5">
            <h3 className="m-0 text-xl font-bold">{t("before")}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2"><strong>+ {t("strongestPro")}</strong>{pro.map((p) => <span key={p} className="text-sm">{p}</span>)}</div>
              <div className="flex flex-col gap-2"><strong>− {t("strongestContra")}</strong>{contra.map((p) => <span key={p} className="text-sm">{p}</span>)}</div>
            </div>
            {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setSheet(false)} className={btn.secondaryLg}>{tc("back")}</button>
              <button type="button" disabled={pending} onClick={submit} className={btn.primaryLg}>{t("castAs", { choice: t(`choice.${choice ?? "yes"}`) })}</button>
            </div>
          </div>
        )}

        {voted && !changing && (
          <div role="status" className="flex gap-4 border border-line bg-surface p-5">
            <Glyph shape="keyhole" size={56} />
            <div className="flex flex-col gap-1.5">
              <strong className="text-lg">{t("counted")}</strong>
              <span>{open ? t("canChange", { date: dateTime(ballot.closes_at, locale) }) : t("closedSecret")}</span>
              {open && <button type="button" onClick={() => setChanging(true)} className={`${btn.ghost} self-start px-0`}>{t("change")}</button>}
            </div>
          </div>
        )}
        {error && !sheet && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
      </section>

      <aside aria-label={t("result")} className="flex flex-col gap-4 border-t-[6px] border-ink pt-4">
        {open ? (
          <>
            <span className="text-sm font-bold">{t("endsAt", { date: dateTime(ballot.closes_at, locale) })}</span>
            <strong className="text-3xl tracking-[-0.02em]">{t("daysLeft", { n: daysUntil(ballot.closes_at) })}</strong>
            <span className="text-sm">{t("blind")}</span>
          </>
        ) : results ? (
          <>
            <span className="text-sm font-bold">{t("final", { date: dateTime(ballot.closes_at, locale) })}</span>
            <strong className={`text-3xl tracking-[-0.02em] ${results.passed ? "text-red" : ""}`}>{results.passed ? t("passed") : t("failed")}</strong>
            {(["yes", "no", "abstain"] as const).map((c) => (
              <div key={c} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm"><span>{t(`choice.${c}`)}</span><span className="tabular">{pctOf(results.main_segment, c)} %</span></div>
                <div className="h-3 bg-chip"><div className={`h-3 ${c === "yes" ? "bg-red" : "bg-ink"}`} style={{ width: `${pctOf(results.main_segment, c)}%` }} /></div>
              </div>
            ))}
            {seg("external").yes !== undefined || seg("external").no !== undefined ? (
              <span className="text-sm">{t("externalResult", { pct: pctOf("external", "yes") })}</span>
            ) : null}
            <span className="text-sm text-muted">{t(ballot.subject_type === "goal" ? "ruleGoal" : "ruleInitiative")}</span>
          </>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm"><span>{t(main === "member" ? "turnoutMembers" : "turnoutAffected")}</span><span className="tabular">{open ? turnoutPct : results?.turnout_pct ?? 0} %</span></div>
          <div className="relative h-3 bg-chip">
            <div className="h-3 bg-ink" style={{ width: `${Math.min(100, open ? turnoutPct : results?.turnout_pct ?? 0)}%` }} />
            {(ballot.quorum_pct > 0 || ballot.subject_type === "goal") && (
              <div aria-hidden="true" className="absolute -top-1 h-5 w-0.5 bg-red" style={{ left: `${ballot.subject_type === "goal" ? 50 : ballot.quorum_pct}%` }} />
            )}
          </div>
          <span className="text-sm text-muted">
            {t("voters", { n: open ? mainVoters : results?.voters ?? 0, eligible: open ? eligible : results?.eligible ?? 0 })}
            {open && other > 0 ? ` · ${t("externalVoters", { n: other })}` : ""}
          </span>
        </div>
      </aside>
    </div>
  );
}
