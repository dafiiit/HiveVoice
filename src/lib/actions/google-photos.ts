"use server";
import { randomUUID } from "node:crypto";
import { createSupabaseServer } from "../supabase/server";
import { getSession } from "../session";
import { IMAGE_BUCKET } from "../images";

// Google Photos Picker API: the member chooses photos in Google's own picker and the
// app only ever sees what was chosen. The access token comes from the browser, is used
// for these calls and is never stored.
const API = "https://photospicker.googleapis.com/v1";
const MAX_BYTES = 6 * 1024 * 1024;

type Failure = { ok: false; error: "not_authenticated" | "google" | "empty" | "invalid" };

const call = (token: string, path: string, init?: RequestInit) =>
  fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });

/** Starts a picker session. The browser sends the member to pickerUri. */
export async function startPhotoPicker(token: string, max: number): Promise<{ ok: true; id: string; pickerUri: string; pollMs: number } | Failure> {
  if (!(await getSession())) return { ok: false, error: "not_authenticated" };
  if (!token || token.length > 4096) return { ok: false, error: "invalid" };
  const res = await call(token, "/sessions", { method: "POST", body: JSON.stringify({ pickingConfig: { maxItemCount: String(Math.min(Math.max(max, 1), 10)) } }) });
  if (!res.ok) return { ok: false, error: "google" };
  const s = (await res.json()) as { id: string; pickerUri: string; pollingConfig?: { pollInterval?: string } };
  const pollMs = Math.max(2000, Math.round(parseFloat(s.pollingConfig?.pollInterval ?? "4") * 1000) || 4000);
  return { ok: true, id: s.id, pickerUri: s.pickerUri, pollMs };
}

/** True once the member has finished choosing. */
export async function checkPhotoPicker(token: string, id: string): Promise<{ ok: true; done: boolean } | Failure> {
  if (!(await getSession())) return { ok: false, error: "not_authenticated" };
  const res = await call(token, `/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) return { ok: false, error: "google" };
  const s = (await res.json()) as { mediaItemsSet?: boolean };
  return { ok: true, done: !!s.mediaItemsSet };
}

/** Copies the chosen photos into the member's own folder of the image bucket. */
export async function importPickedPhotos(token: string, id: string, max: number, maxSide: number): Promise<{ ok: true; paths: string[] } | Failure> {
  if (!(await getSession())) return { ok: false, error: "not_authenticated" };
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "not_authenticated" };

  const list = await call(token, `/mediaItems?sessionId=${encodeURIComponent(id)}&pageSize=10`);
  if (!list.ok) return { ok: false, error: "google" };
  const items = ((await list.json()) as { mediaItems?: { type?: string; mediaFile?: { baseUrl?: string } }[] }).mediaItems ?? [];
  const side = Math.min(Math.max(maxSide, 256), 2048);
  const paths: string[] = [];
  for (const item of items.filter((i) => i.type === "PHOTO").slice(0, Math.max(max, 0))) {
    const base = item.mediaFile?.baseUrl;
    if (!base || !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(base)) continue;
    const img = await fetch(`${base}=w${side}-h${side}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const type = img.headers.get("content-type")?.split(";")[0] ?? "";
    const ext = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : null;
    if (!img.ok || !ext) continue;
    const bytes = Buffer.from(await img.arrayBuffer());
    if (bytes.length > MAX_BYTES) continue;
    const path = `${auth.user.id}/${randomUUID().replace(/-/g, "")}.${ext}`;
    const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, bytes, { contentType: type, cacheControl: "31536000" });
    if (!error) paths.push(path);
  }
  // The session is not needed any more; Google deletes it anyway after a while.
  await call(token, `/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  return paths.length ? { ok: true, paths } : { ok: false, error: "empty" };
}
