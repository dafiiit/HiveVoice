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
  // ?k= carries the key of a document that is shared "with everybody who has the link".
  const key = request.nextUrl.searchParams.get("k");
  const [file] = await asViewer(viewer, (tx) => tx<{ path: string; name: string; mime: string; scan_status: string; can_download: boolean }[]>`
    select a.path, a.name, a.mime, a.scan_status, app.attachment_download_allowed(a.id) as can_download from public.attachments a where a.id = ${id}`,
    { linkToken: key && /^[0-9a-f]{32}$/.test(key) ? key : null });
  if (!file || file.scan_status === "infected") return new NextResponse("Not found", { status: 404 });

  // Photos and PDFs open in the browser, everything else downloads. ?dl=1 forces a download.
  // When the owner switched downloads off, only the view in the browser is left (a screenshot can never be prevented).
  const viewable = isImage(file.mime) || file.mime === "application/pdf";
  if (!file.can_download && (!viewable || request.nextUrl.searchParams.get("dl") === "1")) return new NextResponse("Download is switched off for this document", { status: 403 });
  const inline = viewable && request.nextUrl.searchParams.get("dl") !== "1";
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(file.path, 3600, inline ? undefined : { download: file.name });
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
}
