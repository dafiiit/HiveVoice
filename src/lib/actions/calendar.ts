"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import type { Recur, RsvpStatus } from "../calendar";

export type EventInput = {
  id?: string; groupId?: string | null; listingId?: string | null; kind: "event" | "duty"; title: string; description: string;
  /** ISO time of the (first) start. */
  startsAt: string; durationMinutes: number; allDay: boolean; tz: string; place: string; regionId: string | null; onlineUrl: string;
  visibility: "private" | "public"; recur: Recur; recurUntil: string | null; rsvp: boolean; capacity: number | null;
  roles: { id?: string; name: string; needed: number }[]; rotation: string[]; guests: string[];
};

const fresh = (slug?: string | null) => {
  revalidatePath("/me/calendar");
  revalidatePath("/community/events");
  revalidatePath("/events/[id]", "page");
  if (slug) { revalidatePath(`/groups/${slug}`); revalidatePath("/friends", "layout"); }
};

/** Writes a new date or series, or changes one (owner, or admins and maintainers of its group). */
export async function saveEvent(input: EventInput, slug?: string | null) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.save_event(${tx.json({
      id: input.id ?? null, group_id: input.groupId ?? null, listing_id: input.listingId ?? null, kind: input.kind, title: input.title,
      description: input.description, starts_at: input.startsAt, duration_minutes: input.durationMinutes, all_day: input.allDay, tz: input.tz,
      place: input.place, region_id: input.regionId, online_url: input.onlineUrl, visibility: input.visibility, recur: input.recur,
      recur_until: input.recurUntil, rsvp: input.rsvp, capacity: input.capacity, roles: input.roles, rotation: input.rotation, guests: input.guests,
    })}) as id`;
    return id;
  });
  fresh(slug);
  if (input.listingId) revalidatePath(`/listings/${input.listingId}`);
  return res;
}

/** Cancels a whole date or series (it stays visible), brings it back or deletes it. */
export async function cancelEvent(id: string, mode: "cancel" | "restore" | "delete", slug?: string | null) {
  const res = await run(async (tx) => { await tx`select app.cancel_event(${id}, ${mode})`; return null; });
  fresh(slug);
  return res;
}

/** Cancels one date of a series, or brings it back. */
export async function cancelOccurrence(id: string, at: string, cancelled: boolean, slug?: string | null) {
  const res = await run(async (tx) => { await tx`select app.cancel_occurrence(${id}, ${at}::timestamptz, ${cancelled})`; return null; });
  fresh(slug);
  return res;
}

/** Zu- oder Absage for one date; null takes the answer back. */
export async function rsvp(id: string, at: string, status: RsvpStatus | null, roleId: string | null = null, note = "", slug?: string | null) {
  const res = await run(async (tx) => { await tx`select app.rsvp(${id}, ${at}::timestamptz, ${status}, ${roleId}, ${note || null})`; return null; });
  fresh(slug);
  return res;
}

/** A duty: take over, look for cover (or stop looking), tick off, or put someone on it. */
export async function dutyAction(id: string, at: string, action: "take" | "cover" | "uncover" | "done" | "undone" | "assign", profileId: string | null = null, note = "", slug?: string | null) {
  const res = await run(async (tx) => { await tx`select app.duty(${id}, ${at}::timestamptz, ${action}, ${profileId}, ${note || null})`; return null; });
  fresh(slug);
  return res;
}

/** Reminders on or off, or a new address for the calendar feed (the old one stops working). */
export async function calendarSettings(p: { remindDay?: boolean; remindHour?: boolean; newToken?: boolean }) {
  const res = await run(async (tx) => {
    const [{ s }] = await tx<{ s: { remind_day: boolean; remind_hour: boolean; feed_token: string } }[]>`select app.calendar_settings(${tx.json({
      ...(p.remindDay === undefined ? {} : { remind_day: p.remindDay }), ...(p.remindHour === undefined ? {} : { remind_hour: p.remindHour }), new_token: !!p.newToken,
    })}) as s`;
    return s;
  });
  revalidatePath("/me/calendar");
  return res;
}
