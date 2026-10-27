import { NextResponse, type NextRequest } from "next/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";

// A few bytes that change when something changed for the person: the pages ask this every few seconds and draw
// themselves again only when the answer differs, instead of drawing themselves again every few seconds.
// "friends": chats, requests, notifications. "board": the pinboard's posts. Read with the person's own rights.
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const stamp = await asViewer(viewer, async (tx) => {
    if (scope === "board") {
      const [r] = await tx<{ s: string }[]>`select md5(concat_ws('|', count(*), max(created_at))) as s from public.posts`;
      return r.s;
    }
    if (scope === "friends" && me) {
      const [r] = await tx<{ s: string }[]>`
        select md5(concat_ws('|',
          (select max(m.created_at) from public.messages m join public.conversation_participants cp on cp.conversation_id = m.conversation_id where cp.profile_id = ${me}),
          (select count(*) from public.contact_requests q where q.to_profile_id = ${me} and q.status = 'pending'),
          (select count(*) from public.group_join_requests j where j.status = 'pending' and j.profile_id <> ${me} and app.has_group_permission(j.group_id, 'manage_members')),
          (select max(n.created_at) from public.notifications n where n.profile_id = ${me}),
          (select count(*) from public.conversation_participants where profile_id = ${me}))) as s`;
      return r.s;
    }
    return "";
  }).catch(() => null);
  if (stamp === null) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ s: stamp }, { headers: { "Cache-Control": "no-store" } });
}
