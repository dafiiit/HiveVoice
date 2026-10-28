// Dates of the calendar as people read them: in the app's time zone, whichever zone the server or device is in.
export const TZ = process.env.NEXT_PUBLIC_TIME_ZONE || "Europe/Berlin";

/** "2027-03-18" of an instant, in the app's zone (to group a list by day). */
export const dayKey = (iso: string | Date, tz = TZ) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** "19:00" */
export const clock = (iso: string | Date, locale: string, tz = TZ) =>
  new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** "Donnerstag, 18. März" (with the year when it is not this one). */
export const dayLabel = (iso: string | Date, locale: string, tz = TZ) => {
  const d = new Date(iso);
  const year = dayKey(d, tz).slice(0, 4) !== dayKey(new Date(), tz).slice(0, 4);
  return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: year ? "numeric" : undefined }).format(d);
};

/** "Do., 18. März, 19:00" for one line (notifications, other dates). */
export const whenShort = (iso: string | Date, locale: string, allDay = false, tz = TZ) =>
  new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "long", ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(new Date(iso));

/** The parts a date and a time field want ("2027-03-18", "19:00") for an instant, in the app's zone. */
export function toFields(iso: string | Date, tz = TZ) {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date: dayKey(d, tz), time };
}

/** The instant of a date and time typed in the app's zone (summer time included). */
export function fromFields(date: string, time: string, tz = TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // How far the zone is from UTC at that moment; twice, so the switch day lands right.
  const offset = (t: number) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).reduce<Record<string, number>>((a, x) => (x.type === "literal" ? a : { ...a, [x.type]: Number(x.value) }), {});
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

/** The page of one date of a series. */
export const occurrenceHref = (o: { event_id: string; occurs_at: string }) => `/events/${o.event_id}?at=${encodeURIComponent(o.occurs_at)}`;
