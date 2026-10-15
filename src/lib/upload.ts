"use client";
import { createSupabaseBrowser } from "./supabase/client";
import { IMAGE_BUCKET } from "./images";

export type UploadResult = { ok: true; path: string } | { ok: false; error: "type" | "decode" | "auth" | "upload" };

/**
 * Shrinks a photo in the browser (long side at most maxSide, JPEG) and stores it
 * in the member's own folder of the image bucket. Phones deliver 5 to 10 MB
 * originals; this keeps storage and traffic small without a server round trip.
 */
export async function uploadImage(file: File, maxSide = 1280): Promise<UploadResult> {
  if (!/^image\//.test(file.type)) return { ok: false, error: "type" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, error: "decode" };
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "decode" };
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white instead of black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return { ok: false, error: "decode" };

  const supabase = createSupabaseBrowser();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "auth" };
  const path = `${data.user.id}/${crypto.randomUUID().replace(/-/g, "")}.jpg`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  return error ? { ok: false, error: "upload" } : { ok: true, path };
}
