"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EventFull, EventPerson, Recur } from "@/lib/calendar";
import { saveEvent } from "@/lib/actions/calendar";
import { useAction } from "../ui/Action";
import { Dialog } from "../ui/Dialog";
import { Notice } from "../ui/Page";
import { PersonPicker } from "../ui/PersonPicker";
import { Avatar } from "../ui/Avatar";
import { IconClose, IconPlus } from "../ui/Icons";
import { btn, field, segment, segments } from "../ui/styles";
import { fromFields, toFields, TZ } from "./time";

const RECURS: Recur[] = ["none", "daily", "weekly", "biweekly", "monthly"];

export type EventContext = {
  groupId?: string | null; slug?: string | null; members?: EventPerson[]; listingId?: string | null;
  /** May the date go public (admins of the group, or a public group's posters; everybody for personal dates). */
  canPublic: boolean; regionId?: string | null;
};

/** A button that opens the form for a new date (or duty), or for changing one (`initial`). */
export function EventForm({ context, initial, kind: firstKind = "event", label, look = btn.primary, start, defaultOpen = false }: {
  context: EventContext; initial?: EventFull; kind?: "event" | "duty"; label: ReactNode; look?: string; start?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={look}>{label}</button>
      {open && <Form context={context} initial={initial} firstKind={firstKind} start={start} onClose={() => setOpen(false)} />}
    </>
  );
}

function Form({ context, initial, firstKind, start, onClose }: { context: EventContext; initial?: EventFull; firstKind: "event" | "duty"; start?: string; onClose: () => void }) {
  const t = useTranslations("calendar.form");
  const tr = useTranslations("calendar.recur");
  const router = useRouter();
  const { run, pending, error, setError } = useAction();
  // A new date starts tomorrow at 19:00, or on the day picked.
  const [begin] = useState(() => (initial ? toFields(initial.starts_at) : { date: start ?? toFields(new Date(Date.now() + 86400000)).date, time: "19:00" }));
  const endAt = initial ? toFields(new Date(new Date(initial.starts_at).getTime() + initial.duration_minutes * 60000)) : null;
  const [kind, setKind] = useState<"event" | "duty">(initial?.kind ?? firstKind);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(begin.date);
  const [time, setTime] = useState(begin.time);
  const [endTime, setEndTime] = useState(endAt?.time ?? (() => { const [h, m] = begin.time.split(":").map(Number); return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; })());
  const [endDate, setEndDate] = useState(endAt?.date ?? begin.date);
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [recur, setRecur] = useState<Recur>(initial?.recur ?? (firstKind === "duty" ? "weekly" : "none"));
  const [until, setUntil] = useState(initial?.recur_until ?? "");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [online, setOnline] = useState(initial?.online_url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<"private" | "public">(initial?.visibility ?? (context.listingId ? "public" : "private"));
  const [answers, setAnswers] = useState(initial?.rsvp ?? true);
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [roles, setRoles] = useState<{ id?: string; name: string; needed: number }[]>(initial?.roles ?? []);
  const [rotation, setRotation] = useState<EventPerson[]>(initial?.rotation.length ? initial.rotation : (context.members ?? []));
  const [guests, setGuests] = useState<EventPerson[]>(initial?.guests ?? []);
  const inGroup = !!context.groupId || !!initial?.group_id;
  const duty = kind === "duty";

  const submit = () => {
    const from = fromFields(date, allDay ? "00:00" : time);
    const to = allDay ? fromFields(endDate, "00:00") : fromFields(endDate, endTime);
    const minutes = allDay ? Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1) * 1440 : Math.round((to.getTime() - from.getTime()) / 60000);
    if (minutes < 0) { setError(t("endBeforeStart")); return; }
    if (duty && !rotation.length) { setError(t("rotationEmpty")); return; }
    run(() => saveEvent({
      id: initial?.id, groupId: context.groupId ?? null, listingId: context.listingId ?? null, kind, title, description,
      startsAt: from.toISOString(), durationMinutes: minutes, allDay, tz: initial?.tz ?? TZ, place, regionId: initial?.region_id ?? context.regionId ?? null,
      onlineUrl: online, visibility, recur, recurUntil: recur === "none" ? null : until || null, rsvp: duty ? false : answers,
      capacity: capacity ? Math.max(1, Number(capacity)) : null, roles: duty ? [] : roles.filter((r) => r.name.trim()),
      rotation: rotation.map((p) => p.id), guests: guests.map((p) => p.id),
    }, context.slug ?? initial?.group_slug), {
      onOk: (res) => {
        onClose();
        // A new date opens on its page; a changed one stays where it was.
        if (!initial && res.ok) router.push(`/events/${res.data}`);
      },
    });
  };

  const move = (i: number) => setRotation((r) => { const n = [...r]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  return (
    <Dialog title={initial ? t("titleEdit") : duty ? t("titleDuty") : t("titleNew")} onClose={onClose} wide>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {inGroup && !initial && (
          <span role="group" aria-label={t("kind")} className={segments}>
            {(["event", "duty"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); if (k === "duty" && recur === "none") setRecur("weekly"); }} className={segment(kind === k)}>{t(`kinds.${k}`)}</button>
            ))}
          </span>
        )}
        <label className={field.label}>{t("name")}
          <input required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("namePlaceholder")} className={field.input} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={field.label}>{t("date")}
            <input type="date" required value={date} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} className={field.input} />
          </label>
          {!allDay && <label className={field.label}>{t("start")}
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={field.input} />
          </label>}
          {allDay && <label className={field.label}>{t("end")}
            <input type="date" required min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field.input} />
          </label>}
          {!allDay && <label className={`${field.label} col-start-2`}>{t("end")}
            <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field.input} />
          </label>}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-6 w-6 flex-none accent-[var(--ink)]" />
          {t("allDay")}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={field.label}>{t("repeat")}
            <select value={recur} onChange={(e) => setRecur(e.target.value as Recur)} className={field.select}>
              {RECURS.filter((r) => !duty || r !== "none").map((r) => <option key={r} value={r}>{tr(r)}</option>)}
            </select>
          </label>
          {recur !== "none" && <label className={field.label}>{t("until")}
            <input type="date" min={date} value={until} onChange={(e) => setUntil(e.target.value)} className={field.input} />
          </label>}
        </div>
        <label className={field.label}>{t("place")}
          <input maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("placePlaceholder")} className={field.input} />
        </label>
        {!duty && <label className={field.label}>{t("online")}
          <input type="url" maxLength={500} value={online} onChange={(e) => setOnline(e.target.value)} placeholder="https://" className={field.input} />
        </label>}
        <label className={field.label}>{t("description")}
          <textarea rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} className={field.textarea} />
        </label>

        {duty && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 text-sm font-bold">{t("rotation")}</legend>
            <span className={field.hint}>{t("rotationHint")}</span>
            <ol className="m-0 flex list-none flex-col p-0">
              {rotation.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 border-b border-line py-1.5">
                  <span className="w-6 text-sm font-bold tabular-nums">{i + 1}.</span>
                  <Avatar name={p.name} seed={p.seed} path={p.path} size={28} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {i > 0 && <button type="button" onClick={() => move(i)} className={btn.linkMuted}>{t("up")}</button>}
                  <button type="button" aria-label={t("remove")} onClick={() => setRotation((r) => r.filter((x) => x.id !== p.id))}
                    className="inline-flex h-11 w-11 items-center justify-center border-0 bg-transparent text-ink"><IconClose size={16} /></button>
                </li>
              ))}
            </ol>
            {(context.members ?? []).filter((m) => !rotation.some((r) => r.id === m.id)).length > 0 && (
              <span className="flex flex-wrap gap-2">
                {(context.members ?? []).filter((m) => !rotation.some((r) => r.id === m.id)).map((m) => (
                  <button key={m.id} type="button" onClick={() => setRotation((r) => [...r, m])} className={btn.secondarySm}><IconPlus size={14} /> {m.name}</button>
                ))}
              </span>
            )}
          </fieldset>
        )}

        {!duty && (
          <>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
              <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} className="h-6 w-6 flex-none accent-[var(--ink)]" />
              {t("answers")}
            </label>
            {answers && (
              <>
                <label className={field.label}>{t("capacity")}
                  <input type="number" min={1} max={100000} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${field.input} max-w-[160px]`} />
                  <span className={field.hint}>{t("capacityHint")}</span>
                </label>
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1.5 text-sm font-bold">{t("roles")}</legend>
                  <span className={field.hint}>{t("rolesHint")}</span>
                  {roles.map((r, i) => (
                    <span key={r.id ?? `new-${i}`} className="flex items-center gap-2">
                      <input aria-label={t("roleNeeded")} type="number" min={1} max={1000} value={r.needed}
                        onChange={(e) => setRoles((all) => all.map((x, j) => (j === i ? { ...x, needed: Math.max(1, Number(e.target.value) || 1) } : x)))} className={`${field.input} w-20`} />
                      <span aria-hidden>×</span>
                      <input aria-label={t("roleName")} maxLength={60} value={r.name} placeholder={t("roleName")}
                        onChange={(e) => setRoles((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={field.input} />
                      <button type="button" aria-label={t("remove")} onClick={() => setRoles((all) => all.filter((_, j) => j !== i))}
                        className="inline-flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent text-ink"><IconClose size={16} /></button>
                    </span>
                  ))}
                  {roles.length < 20 && <button type="button" onClick={() => setRoles((r) => [...r, { name: "", needed: 1 }])} className={`${btn.secondarySm} self-start`}>{t("addRole")}</button>}
                </fieldset>
              </>
            )}
          </>
        )}

        {!context.listingId && (
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1.5 text-sm font-bold">{t("who")}</legend>
            {(["private", "public"] as const).filter((v) => v === "private" || context.canPublic || visibility === "public").map((v) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} className="h-6 w-6 flex-none accent-[var(--ink)]" />
                {v === "private" ? (inGroup ? t("visibility.privateGroup") : t("visibility.private")) : t("visibility.public")}
              </label>
            ))}
          </fieldset>
        )}

        {!inGroup && (
          <div className="flex flex-col gap-2">
            <PersonPicker label={t("guests")} placeholder={t("guestsPlaceholder")} exclude={guests.map((g) => g.id)}
              onPick={(p) => setGuests((g) => [...g, { id: p.id, name: p.name, seed: p.seed, path: p.path }])} />
            {guests.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {guests.map((g) => (
                  <li key={g.id} className="inline-flex items-center gap-1.5 border border-line pl-1.5">
                    <Avatar name={g.name} seed={g.seed} path={g.path} size={24} /> <span className="text-sm">{g.name}</span>
                    <button type="button" aria-label={`${t("remove")}: ${g.name}`} onClick={() => setGuests((all) => all.filter((x) => x.id !== g.id))}
                      className="inline-flex h-10 w-10 items-center justify-center border-0 bg-transparent text-ink"><IconClose size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !title.trim()} className={btn.primary}>{initial ? t("save") : t("create")}</button>
          <button type="button" onClick={onClose} className={btn.secondary}>{t("cancel")}</button>
        </div>
      </form>
    </Dialog>
  );
}
