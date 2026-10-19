import { NextResponse, type NextRequest } from "next/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";

// The group's data for its admins: members, goals, tasks, posts, shared items (notes with their text) and the file list.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const viewer = { authId: session.authId, profileId: session.profile.id };
  const data = await asViewer(viewer, async (tx) => {
    const [g] = await tx<{ id: string; name: string; summary: string | null; description: string | null; kind: string; visibility: string; created_at: string; role: string | null }[]>`
      select g.id, g.name, g.summary, g.description, g.kind::text, g.visibility::text, g.created_at, app.group_role(g.id)::text as role from public.groups g where g.slug = ${slug}`;
    if (!g || g.role !== "admin") return null;
    const members = await tx`select p.display_name as name, m.role::text, m.joined_at from public.group_members m join public.profiles p on p.id = m.profile_id where m.group_id = ${g.id} order by m.joined_at`;
    const goals = await tx`select title, description, status::text, timeline, created_at from public.goals where group_id = ${g.id} order by created_at`;
    const tasks = await tx`select title, status::text, created_at from public.tasks where group_id = ${g.id} order by created_at`;
    const posts = await tx`select p.body, p.created_at, a.display_name as author, p.parent_id from public.posts p join public.profiles a on a.id = p.author_id where p.group_id = ${g.id} and p.hidden_at is null order by p.created_at`;
    const items = await tx`
      select r.title, r.description, r.origin, r.url, r.body_md, r.created_at, o.display_name as author,
             (select jsonb_agg(jsonb_build_object('name', a.name, 'mime', a.mime, 'size', a.size_bytes, 'link', '/api/files/' || a.id)) from public.attachments a where a.resource_id = r.id) as files
      from public.resources r join public.profiles o on o.id = r.owner_id where r.group_id = ${g.id} and r.hidden_at is null order by r.created_at`;
    return { exported_at: new Date().toISOString(), group: { name: g.name, summary: g.summary, description: g.description, kind: g.kind, visibility: g.visibility, created_at: g.created_at }, members, goals, tasks, posts, items };
  });
  if (!data) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-export.json"`, "Cache-Control": "no-store" },
  });
}
