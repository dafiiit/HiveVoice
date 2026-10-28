import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { credentials, download, NextcloudError, preview } from "@/lib/nextcloud";

// A file of a connected Nextcloud folder, for those who may use the connection: ?path=…&size=256 a small picture of it
// (Nextcloud makes it), without size the file itself. Only files inside the chosen folder; the app password stays here.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const size = Number(request.nextUrl.searchParams.get("size") ?? 0);
  if (!/^[0-9a-f-]{36}$/.test(id) || !path) return new Response("not found", { status: 404 });
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  try {
    const cred = await credentials(viewer, id);
    const res = size ? await preview(cred, path, Math.min(1600, Math.max(64, size))) : await download(cred, path);
    if (!res.ok || !res.body) return new Response("not found", { status: 404 });
    const type = res.headers.get("content-type") ?? "application/octet-stream";
    const name = path.split("/").pop() ?? "datei";
    return new Response(res.body, {
      headers: {
        "content-type": type,
        "cache-control": "private, max-age=600",
        // Pictures open in the browser; everything else downloads (nothing from the folder runs as a page here).
        "content-disposition": `${/^image\/(jpeg|png|gif|webp)$/.test(type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    return new Response(e instanceof NextcloudError ? e.message : "error", { status: e instanceof NextcloudError && e.message === "not_allowed" ? 403 : 502 });
  }
}
