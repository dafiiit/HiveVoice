// Dates are shown in the time of the people using the app (the server runs in UTC).
const TZ = process.env.NEXT_PUBLIC_TIME_ZONE || "Europe/Berlin";

export function relTime(date: Date | string, locale: string, now = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }).format(d);
}

export function dateLong(date: Date | string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(date));
}

export function dateTime(date: Date | string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export function num(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n);
}

export function euro(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function daysUntil(date: Date | string, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(date).getTime() - now.getTime()) / 86400000));
}

/** Whether a second label says something new next to the first ("Karte · Karten" and "Notiz · Notiz in HiveVoice" do not). */
export function addsInfo(first: string, second: string) {
  const a = first.toLowerCase(), b = second.toLowerCase();
  const stem = (x: string) => x.slice(0, Math.max(4, Math.min(x.length, 5)));
  return !(a === b || b.startsWith(stem(a)) || a.startsWith(stem(b)));
}

/** An amount in any currency, with cents only when there are some ("12 €", "12,50 €"). */
export function money(cents: number, currency: string, locale: string, opts: { cents?: boolean } = {}) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: opts.cents || cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
}
