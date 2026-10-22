import { NextResponse } from "next/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";

// A diagram as a picture, for notes that show it (`![…](diagram:<id>)`). Only for those who may read the diagram itself
// (row level security on public.resources). The SVG never runs scripts: it is shown through <img>, and opened on its own
// a strict content policy and a sandbox apply.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const [d] = await asViewer(viewer, (tx) => tx<{ body_md: string }[]>`
    select body_md from public.resources where id = ${id} and origin = 'diagram' and trashed_at is null`);
  if (!d) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(d.body_md, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox",
      "X-Content-Type-Options": "nosniff",
      // A diagram changes with every save: the browser asks again each time.
      "Cache-Control": "private, no-cache",
    },
  });
}
