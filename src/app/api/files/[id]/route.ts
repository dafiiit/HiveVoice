import { NextResponse, type NextRequest } from "next/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { FILE_BUCKET, isImage } from "@/lib/files";

// Hands out a short redirect to a signed link, but only when the database says this person may read
// the message, post or shared item the file belongs to (row level security on public.attachments).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const [file] = await asViewer(viewer, (tx) => tx<{ path: string; name: string; mime: string }[]>`
    select path, name, mime from public.attachments where id = ${id}`);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // Photos and PDFs open in the browser, everything else downloads. ?dl=1 forces a download.
  const inline = (isImage(file.mime) || file.mime === "application/pdf") && request.nextUrl.searchParams.get("dl") !== "1";
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(file.path, 3600, inline ? undefined : { download: file.name });
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
}
