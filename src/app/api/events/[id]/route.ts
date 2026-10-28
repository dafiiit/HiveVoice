import { type NextRequest } from "next/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadEvent } from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";

// One date (or a whole series' coming dates) as a file for one's calendar app, read with the person's rights.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const at = request.nextUrl.searchParams.get("at");
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const data = await asViewer(viewer, async (tx) => {
    const e = await loadEvent(tx, id);
    if (!e) return null;
    const from = at ? new Date(at) : new Date(Date.now() - 86400000);
    const to = at ? new Date(new Date(at).getTime() + 1000) : new Date(Date.now() + 365 * 86400000);
    const times = await tx<{ occurs_at: Date }[]>`select t.occurs_at from public.events e, app.event_times(e, ${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz) t where e.id = ${id} limit 400`;
    return { e, times: times.map((t) => t.occurs_at) };
  });
  if (!data) return new Response("not found", { status: 404 });
  const { e, times } = data;
  const origin = request.nextUrl.origin;
  const body = buildIcs(e.title, times.map((t) => ({
    uid: `${e.id}-${t.getTime()}@hivevoice`, start: t, minutes: e.duration_minutes, allDay: e.all_day, title: e.title,
    description: e.description, place: e.place ?? e.online_url, url: `${origin}/events/${e.id}?at=${encodeURIComponent(t.toISOString())}`,
    cancelled: !!e.cancelled_at, alarms: [60],
  })), e.tz);
  const name = e.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "termin";
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.ics"` } });
}
