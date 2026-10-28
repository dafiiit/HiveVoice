"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Occurrence, RsvpStatus } from "@/lib/calendar";
import { sendOrQueue, type Sent } from "@/lib/queue";
import { useAction } from "../ui/Action";
import { Notice } from "../ui/Page";
import { btn, tag } from "../ui/styles";
import { clock, dayKey, dayLabel, occurrenceHref } from "./time";


/**
 * Dates as a list by day: time, title, where, and what is open for me (answer, my turn, cover wanted).
 * `group`: the name of the group stands on each line (my own calendar mixes them).
 */
export function Agenda({ items, me, showGroup = false, empty, slug }: { items: Occurrence[]; me: string | null; showGroup?: boolean; empty: string; slug?: string }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  // The moment the list was drawn: "today", "past" and what can still be answered are read against it.
  const [now] = useState(() => Date.now());
  if (!items.length) return <Notice tone="hint" className="text-base">{empty}</Notice>;
  const today = dayKey(new Date(now)), tomorrow = dayKey(new Date(now + 86400000));
  const days: { key: string; items: Occurrence[] }[] = [];
  for (const o of items) {
    const k = dayKey(o.occurs_at);
    if (days.at(-1)?.key !== k) days.push({ key: k, items: [] });
    days.at(-1)!.items.push(o);
  }
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => (
        <section key={d.key} aria-label={dayLabel(d.items[0].occurs_at, locale)} className="flex flex-col">
          <h3 className="m-0 border-b-2 border-ink pb-2 text-base font-bold">
            {d.key === today ? `${t("today")} · ` : d.key === tomorrow ? `${t("tomorrow")} · ` : ""}{dayLabel(d.items[0].occurs_at, locale)}
          </h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {d.items.map((o) => <Row key={`${o.event_id}-${o.occurs_at}`} o={o} me={me} now={now} showGroup={showGroup} slug={slug ?? o.group_slug} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ o, me, now, showGroup, slug }: { o: Occurrence; me: string | null; now: number; showGroup: boolean; slug: string | null }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const router = useRouter();
  const { run, pending, error } = useAction();
  // My answer and my tick show at once, also while they wait on the device for the connection.
  const [status, setStatus] = useState<RsvpStatus | null>(o.my_status);
  const [done, setDone] = useState(o.done);
  const [seen, setSeen] = useState(o);
  if (seen !== o) { setSeen(o); setStatus(o.my_status); setDone(o.done); }
  const send = (fn: () => Promise<Sent>, undo: () => void) =>
    run(fn, { refresh: false, onOk: (r) => { if (!r.queued) router.refresh(); }, onError: undo });
  const answer = (s: RsvpStatus) => {
    const next = status === s ? null : s;
    setStatus(next);
    send(() => sendOrQueue("rsvp", { id: o.event_id, at: o.occurs_at, status: next, roleId: null, note: "", slug }), () => setStatus(o.my_status));
  };
  const duty = (action: "done" | "take") => {
    if (action === "done") setDone(true);
    send(() => sendOrQueue("duty", { id: o.event_id, at: o.occurs_at, action, slug }), () => setDone(o.done));
  };
  const mine = o.kind === "duty" && o.assignee_id === me;
  const full = o.capacity !== null && o.yes_count >= o.capacity && status !== "yes";
  const past = new Date(o.ends_at).getTime() < now;
  const meta = [
    showGroup ? o.group_name : null,
    o.external ? o.external.calendar : null,
    o.place,
    o.kind === "event" && o.rsvp && (o.yes_count || o.maybe_count) ? t("rsvp.count", { yes: o.yes_count, maybe: o.maybe_count }) : null,
  ].filter(Boolean).join(" · ");
  return (
    <li className={`flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-line py-3 ${o.cancelled || past ? "text-muted" : ""}`}>
      <span className="w-14 flex-none pt-0.5 text-sm font-bold tabular-nums">{o.all_day ? t("allDay") : clock(o.occurs_at, locale)}</span>
      <span className="flex min-w-[180px] flex-1 flex-col gap-1">
        {o.external
          ? <a href={o.external.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-7 items-center font-bold text-ink no-underline hover:underline">{o.title}</a>
          : <Link href={occurrenceHref(o)} className={`inline-flex min-h-7 items-center font-bold text-ink no-underline hover:underline ${o.cancelled ? "line-through" : ""}`}>{o.title}</Link>}
        {meta && <span className="text-sm text-muted">{meta}</span>}
        <span className="flex flex-wrap gap-1.5">
          {o.external && <span className={tag}>Nextcloud</span>}
          {o.cancelled && <span className={`${tag} border-red text-red`}>{t("badges.cancelled")}</span>}
          {o.visibility === "public" && <span className={tag}>{t("badges.public")}</span>}
          {o.kind === "duty" && <span className={`${tag} ${mine && !done ? "border-ink font-bold" : ""}`}>
            {done ? t("duty.done") : o.assignee_id ? (mine ? t("duty.onYou") : t("duty.on", { name: o.assignee_name ?? "?" })) : t("duty.nobody")}
          </span>}
          {o.kind === "duty" && o.cover_wanted && !done && <span className={`${tag} border-red text-red`}>{t("duty.cover")}</span>}
          {o.missing > 0 && !o.cancelled && <span className={`${tag} border-red text-red`}>{t("roles.missing", { n: o.missing })}</span>}
          {full && <span className={tag}>{t("badges.full")}</span>}
        </span>
      </span>
      {/* What I can do right here: answer, take over, tick off. The rest is on the date's own page. */}
      {me && !o.cancelled && !past && !o.external && (
        <span className="flex flex-wrap items-center gap-2">
          {o.kind === "event" && o.rsvp && (
            <>
              <button type="button" disabled={pending || full} aria-pressed={status === "yes"} onClick={() => answer("yes")}
                className={status === "yes" ? btn.primarySm : btn.secondarySm}>{t("rsvp.yes")}</button>
              <button type="button" disabled={pending} aria-pressed={status === "no"} onClick={() => answer("no")}
                className={status === "no" ? btn.primarySm : btn.secondarySm}>{t("rsvp.no")}</button>
            </>
          )}
          {o.kind === "duty" && mine && !done && (
            <button type="button" disabled={pending} onClick={() => duty("done")} className={btn.primarySm}>{t("duty.markDone")}</button>
          )}
          {o.kind === "duty" && !mine && o.cover_wanted && !done && (
            <button type="button" disabled={pending} onClick={() => duty("take")} className={btn.redSm}>{t("duty.take")}</button>
          )}
        </span>
      )}
      {error && <span role="alert" className="w-full text-sm font-bold">{error}</span>}
    </li>
  );
}
