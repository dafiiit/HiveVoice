"use client";
import { useState, useTransition } from "react";
import { useDraft } from "@/lib/drafts";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { proposeGoal, toggleSubgoal } from "@/lib/actions/groups";
import { dateLong } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { BallotPanel, type BallotView } from "../BallotPanel";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

export type GoalView = {
  id: string; title: string; description: string | null; status: "voting" | "adopted" | "rejected" | "done"; timeline: string | null;
  adopted_at: string | null; proposed_by_name: string | null;
  owners: { id: string; name: string; seed: number }[];
  subs: { id: string; title: string; done: boolean }[];
  needs: { id: string; title: string }[];
  ballot: (BallotView & { voted: boolean; turnout: { voters: Record<string, number> | null; eligible: number | null } | null }) | null;
};

export function Goals({ slug, groupId, goals, members, canPropose, canEdit, canVote, isMember, signedIn }: {
  slug: string; groupId: string; goals: GoalView[]; members: { id: string; name: string }[];
  canPropose: boolean; canEdit: boolean; canVote: boolean; isMember: boolean; signedIn: boolean;
}) {
  const t = useTranslations("group.goals");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(members[0]?.id ?? "");
  const [timeline, setTimeline] = useState("");
  const [subs, setSubs] = useState("");
  const [needs, setNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useDraft(`goal:${slug}`, { title, timeline, subs, needs }, (v) => { setTitle(v.title); setTimeline(v.timeline); setSubs(v.subs); setNeeds(v.needs); setOpen(true); });
  const submit = () => start(async () => {
    const res = await proposeGoal(slug, {
      groupId, title, description: "", timeline, owners: owner ? [owner] : [], days: 7,
      subgoals: subs.split("\n").map((s) => s.trim()).filter(Boolean),
      needs: needs.split(",").map((s) => s.trim()).filter(Boolean),
    });
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setOpen(false); setTitle(""); setSubs(""); setNeeds(""); setTimeline("");
  });
  const visible = goals.filter((g) => g.status !== "rejected");
  return (
    <div className="flex flex-col gap-6">
      {visible.length === 0 && <p className="m-0 text-muted">{t("none")}</p>}
      {visible.map((g) => {
        const done = g.subs.filter((s) => s.done).length;
        const pct = g.subs.length ? Math.round((100 * done) / g.subs.length) : g.status === "done" ? 100 : 0;
        return (
          <article key={g.id} className={`flex flex-col gap-3 bg-surface p-5 ${g.status === "voting" ? "border-t-[6px] border-red" : "border-t-[6px] border-ink"}`}>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-bold">{g.status === "voting" ? t("inVote") : t("adopted", { date: g.adopted_at ? dateLong(g.adopted_at, locale) : "" })}</span>
              {g.timeline && <span>{g.timeline}</span>}
            </div>
            <strong className="text-2xl leading-tight">{g.title}</strong>
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t("owners")}</span>
              {g.owners.map((o) => <span key={o.id} className="inline-flex items-center gap-1.5 font-bold"><Avatar name={o.name} seed={o.seed} size={20} />{o.name}</span>)}
              {g.proposed_by_name && <span className="text-muted">· {t("proposedBy", { name: g.proposed_by_name })}</span>}
            </span>
            {g.status !== "voting" && g.subs.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 bg-chip" aria-hidden="true"><div className="h-2 bg-ink" style={{ width: `${pct}%` }} /></div>
                <span className="tabular text-sm font-bold">{pct} %</span>
              </div>
            )}
            {g.subs.length > 0 && (
              <ul className="m-0 flex list-none flex-col p-0">
                {g.subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-line py-2">
                    {canEdit && g.status !== "voting" ? (
                      <button type="button" role="checkbox" aria-checked={s.done} aria-label={s.title} disabled={pending}
                        onClick={() => start(async () => { await toggleSubgoal(slug, s.id, !s.done); })}
                        className={`h-4 w-4 flex-none border border-ink p-0 ${s.done ? "bg-ink" : "bg-transparent"}`} />
                    ) : <span aria-hidden="true" className={`h-4 w-4 flex-none ${s.done ? "bg-ink" : "border border-ink"}`} />}
                    <span className={s.done ? "line-through" : ""}>{s.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {g.needs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">{t("missing")}</span>
                {g.needs.map((n) => <Link key={n.id} href={`/listings/${n.id}`} className="border border-line px-2 py-1 text-ink no-underline">{n.title}</Link>)}
              </div>
            )}
            {g.ballot && g.status === "voting" && (
              <div className="border-t border-line pt-4">
                <BallotPanel ballot={g.ballot} voted={g.ballot.voted} segment={signedIn ? (isMember ? "member" : "guest") : null} turnout={g.ballot.turnout}
                  signedIn={signedIn} canVote={canVote} path={`/groups/${slug}`} pro={[]} contra={[]} compact />
              </div>
            )}
          </article>
        );
      })}
      {canPropose && !open && <button type="button" onClick={() => setOpen(true)} className={`${btn.secondary} self-start border-ink`}>+ {t("propose")}</button>}
      {open && (
        <section aria-label={t("propose")} className="flex flex-col gap-4 border-2 border-ink bg-surface p-5">
          <strong className="text-xl">{t("propose")}</strong>
          <label className={field.label}>{t("goal")}<input value={title} onChange={(e) => setTitle(e.target.value)} className={field.input} /></label>
          <div className="flex flex-wrap gap-4">
            <label className={field.label}>{t("owner")}
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className={field.select}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className={field.label}>{t("until")}<input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder={t("untilPlaceholder")} className={field.input} /></label>
          </div>
          <label className={field.label}>{t("subgoals")}<textarea rows={3} value={subs} onChange={(e) => setSubs(e.target.value)} className={field.textarea} /></label>
          <label className={field.label}>{t("needs")}<input value={needs} onChange={(e) => setNeeds(e.target.value)} placeholder={t("needsPlaceholder")} className={field.input} /></label>
          <span className={field.hint}>{t("rule")}</span>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-3">
            <button type="button" disabled={pending || title.trim().length < 3} onClick={submit} className={btn.primary}>{t("submit")}</button>
            <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
