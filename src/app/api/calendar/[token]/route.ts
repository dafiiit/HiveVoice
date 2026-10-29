import { type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { buildIcs } from "@/lib/ics";
import { getOrigin } from "@/lib/origin";

type Row = {
  event_id: string; occurs_at: Date; duration_minutes: number; all_day: boolean; tz: string; title: string; description: string | null; place: string | null;
  online_url: string | null; group_name: string | null; kind: string; cancelled: boolean; assignee_name: string | null; my_status: string | null;
  updated_at: Date | null; remind_day: boolean; remind_hour: boolean;
};

// The iCal feed of one person (Einstellungen → Kalender abonnieren): the address is the key, so calendar apps need no login.
// `/api/calendar/<key>.ics` and `/api/calendar/<key>` both work.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{32,80}$/.test(token)) return new Response("not found", { status: 404 });
  const rows = await sql<Row[]>`select * from app.calendar_feed(${token})`;
  // An unknown key gives an empty calendar, like a calendar without dates: from outside the two look the same.
  const origin = await getOrigin();
  const body = buildIcs("HiveVoice", rows.map((r) => {
    const alarms = [r.remind_day ? 1440 : null, r.remind_hour ? 60 : null].filter((x): x is number => x !== null);
    const who = r.kind === "duty" && r.assignee_name ? ` (${r.assignee_name})` : "";
    return {
      uid: `${r.event_id}-${r.occurs_at.getTime()}@hivevoice`, start: r.occurs_at, minutes: r.duration_minutes, allDay: r.all_day,
      title: `${r.title}${who}`, description: [r.group_name, r.description].filter(Boolean).join("\n\n") || null,
      place: r.place ?? r.online_url, url: `${origin}/events/${r.event_id}?at=${encodeURIComponent(r.occurs_at.toISOString())}`,
      cancelled: r.cancelled, updated: r.updated_at,
      // Duties only remind the person on duty; dates one said maybe to stay quiet.
      alarms: r.my_status === "maybe" ? [] : alarms,
    };
  }));
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
