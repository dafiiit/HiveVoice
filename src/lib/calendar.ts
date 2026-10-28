import "server-only";
import type { Tx } from "./db";

/** One date of the calendar: a single event, or one date of a series (named by its start, `occurs_at`). */
export type Occurrence = {
  event_id: string; occurs_at: string; ends_at: string; n: number; kind: "event" | "duty"; title: string; place: string | null; online_url: string | null;
  all_day: boolean; visibility: "private" | "public"; recur: Recur; group_id: string | null; group_slug: string | null; group_name: string | null;
  listing_id: string | null; region_id: string | null; region_name: string | null; owner_id: string; cancelled: boolean; my_status: RsvpStatus | null;
  yes_count: number; maybe_count: number; capacity: number | null; rsvp: boolean; missing: number;
  assignee_id: string | null; assignee_name: string | null; cover_wanted: boolean; done: boolean;
  /** A date from a connected Nextcloud calendar: shown, not answered here; `href` opens it in Nextcloud. */
  external?: { source: "nextcloud"; calendar: string; href: string };
};

/** Dates of a Nextcloud calendar in the shape of HiveVoice dates, to stand in the same list. */
export function externalDates(list: { uid: string; start: string; end: string; allDay: boolean; title: string; place: string | null }[], calendar: string, href: string): Occurrence[] {
  return list.map((d) => ({
    event_id: `nc:${d.uid}`, occurs_at: d.start, ends_at: d.end, n: 0, kind: "event", title: d.title || "–", place: d.place, online_url: null,
    all_day: d.allDay, visibility: "private", recur: "none", group_id: null, group_slug: null, group_name: null, listing_id: null, region_id: null,
    region_name: null, owner_id: "", cancelled: false, my_status: null, yes_count: 0, maybe_count: 0, capacity: null, rsvp: false, missing: 0,
    assignee_id: null, assignee_name: null, cover_wanted: false, done: false, external: { source: "nextcloud", calendar, href },
  }));
}

/** Two lists of dates as one, in time order. */
export const byTime = (a: Occurrence[], b: Occurrence[]) => [...a, ...b].sort((x, y) => x.occurs_at.localeCompare(y.occurs_at));
export type Recur = "none" | "daily" | "weekly" | "biweekly" | "monthly";
export type RsvpStatus = "yes" | "maybe" | "no";
export type Scope = "mine" | "group" | "listing" | "public";
export const RECURS: Recur[] = ["none", "daily", "weekly", "biweekly", "monthly"];

/** The dates between `from` and `to` (at most 500), read with the viewer's rights. */
export async function loadCalendar(tx: Tx, from: Date, to: Date, scope: Scope, target: string | null = null): Promise<Occurrence[]> {
  const rows = await tx<(Omit<Occurrence, "occurs_at" | "ends_at"> & { occurs_at: Date; ends_at: Date })[]>`
    select * from app.calendar(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, ${scope}, ${target})`;
  return rows.map((r) => ({ ...r, occurs_at: r.occurs_at.toISOString(), ends_at: r.ends_at.toISOString() }));
}

export type EventRole = { id: string; name: string; needed: number };
export type EventPerson = { id: string; name: string; seed: number; path: string | null };
export type EventFull = {
  id: string; group_id: string | null; group_slug: string | null; group_name: string | null; group_tools: string[] | null; listing_id: string | null; listing_title: string | null;
  owner_id: string; owner_name: string; kind: "event" | "duty"; title: string; description: string | null; starts_at: string; duration_minutes: number;
  all_day: boolean; tz: string; place: string | null; region_id: string | null; region_name: string | null; online_url: string | null;
  visibility: "private" | "public"; recur: Recur; recur_until: string | null; rsvp: boolean; capacity: number | null; cancelled_at: string | null;
  can_edit: boolean; roles: EventRole[]; guests: EventPerson[]; rotation: EventPerson[];
};
export type Answer = EventPerson & { status: RsvpStatus; role_id: string | null; note: string | null };

/** A date with everything its page shows; null when the viewer may not see it. */
export async function loadEvent(tx: Tx, id: string): Promise<EventFull | null> {
  const [e] = await tx<(Omit<EventFull, "starts_at" | "recur_until" | "cancelled_at"> & { starts_at: Date; recur_until: Date | string | null; cancelled_at: Date | null })[]>`
    select e.id, e.group_id, g.slug::text as group_slug, g.name as group_name, g.tools as group_tools, e.listing_id, l.title as listing_title,
      e.owner_id, o.display_name as owner_name, e.kind, e.title, e.description, e.starts_at, e.duration_minutes, e.all_day, e.tz, e.place,
      e.region_id, r.name as region_name, e.online_url, e.visibility, e.recur, e.recur_until::text, e.rsvp, e.capacity, e.cancelled_at,
      app.can_edit_event(e.id) as can_edit,
      coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'needed', x.needed) order by x.position) from public.event_roles x where x.event_id = e.id), '[]') as roles,
      coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'seed', p.avatar_seed, 'path', p.avatar_path) order by p.display_name)
        from public.event_guests x join public.profiles p on p.id = x.profile_id where x.event_id = e.id), '[]') as guests,
      coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'seed', p.avatar_seed, 'path', p.avatar_path) order by x.position)
        from public.duty_rotation x join public.profiles p on p.id = x.profile_id where x.event_id = e.id), '[]') as rotation
    from public.events e join public.profiles o on o.id = e.owner_id
    left join public.groups g on g.id = e.group_id left join public.listings l on l.id = e.listing_id left join public.regions r on r.id = e.region_id
    where e.id = ${id}`;
  if (!e) return null;
  return { ...e, starts_at: e.starts_at.toISOString(), recur_until: e.recur_until ? String(e.recur_until).slice(0, 10) : null, cancelled_at: e.cancelled_at?.toISOString() ?? null };
}

/** Who answered for one date. */
export async function loadAnswers(tx: Tx, id: string, at: string): Promise<Answer[]> {
  return tx<Answer[]>`
    select p.id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path, r.status, r.role_id, r.note
    from public.event_rsvps r join public.profiles p on p.id = r.profile_id
    where r.event_id = ${id} and r.occurs_at = ${at}::timestamptz
    order by array_position(array['yes', 'maybe', 'no'], r.status), p.display_name`;
}

/** The time of this request (pages read "past" and "coming" against it). */
export const nowMs = () => Date.now();

/** The start of today in the app's time zone, and a day `n` days later. */
export function dayStart(offsetDays = 0, tz = process.env.NEXT_PUBLIC_TIME_ZONE || "Europe/Berlin") {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  // The offset of the zone right now (minutes), to turn local midnight into UTC.
  const local = new Date(new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime());
  const offset = Math.round((local.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime()) / 60000);
  const midnight = new Date(`${parts}T00:00:00Z`).getTime() - offset * 60000;
  return new Date(midnight + offsetDays * 86400000);
}
