// iCalendar (RFC 5545) for calendar apps: one VEVENT per date (a series is sent as its single dates, so cancelled dates,
// takeovers and answers per date need no exceptions), with alarms a day and an hour before.

export type IcsEvent = {
  uid: string; start: Date; minutes: number; allDay: boolean; title: string; description?: string | null; place?: string | null;
  url?: string | null; cancelled?: boolean; updated?: Date | null; alarms?: number[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
/** A whole day as the calendar app's own date, read in the given zone. */
const dateIn = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replaceAll("-", "");

/** Text as iCal wants it: backslash, comma, semicolon and line breaks escaped. */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines are at most 75 octets; longer ones continue on the next line after a space. */
export function fold(line: string) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(name: string, events: IcsEvent[], tz = "Europe/Berlin", now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HiveVoice//Kalender//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`, `X-WR-TIMEZONE:${tz}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp(e.updated ?? now)}`);
    if (e.allDay) {
      const end = new Date(e.start.getTime() + Math.max(1, Math.ceil(e.minutes / 1440)) * 86400000);
      lines.push(`DTSTART;VALUE=DATE:${dateIn(e.start, tz)}`, `DTEND;VALUE=DATE:${dateIn(end, tz)}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(new Date(e.start.getTime() + e.minutes * 60000))}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`);
    if (!e.cancelled) {
      for (const m of e.alarms ?? []) {
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${m}M`, "END:VALARM");
      }
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
