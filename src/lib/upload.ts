"use client";
import { createSupabaseBrowser } from "./supabase/client";
import { IMAGE_BUCKET } from "./images";
import { EXT_BY_MIME, FILE_BUCKET, FILE_LIMIT, mimeOf, type UploadedFile } from "./files";

export type UploadResult = { ok: true; path: string } | { ok: false; error: "type" | "decode" | "auth" | "upload" };

/** Draws the photo onto a canvas at the new size and encodes it as JPEG. */
async function shrinkToJpeg(file: File, maxSide: number): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white instead of black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

/**
 * Shrinks a photo in the browser (long side at most maxSide, JPEG) and stores it
 * in the member's own folder of the image bucket. Phones deliver 5 to 10 MB
 * originals; this keeps storage and traffic small without a server round trip.
 */
export async function uploadImage(file: File, maxSide = 1280): Promise<UploadResult> {
  if (!/^image\//.test(file.type)) return { ok: false, error: "type" };
  const blob = await shrinkToJpeg(file, maxSide);
  if (!blob) return { ok: false, error: "decode" };

  const supabase = createSupabaseBrowser();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "auth" };
  const path = `${data.user.id}/${crypto.randomUUID().replace(/-/g, "")}.jpg`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  return error ? { ok: false, error: "upload" } : { ok: true, path };
}

export type AttachmentResult = { ok: true; file: UploadedFile } | { ok: false; error: "type" | "size" | "decode" | "auth" | "upload" };

/**
 * Stores a file in the member's own folder of the private bucket. Photos are shrunk first (long side 1600, JPEG, animated GIFs stay as they are);
 * everything else goes up as it is. The database later checks the stored size and type again.
 */
export async function uploadAttachment(file: File): Promise<AttachmentResult> {
  const mime = mimeOf(file);
  if (!mime) return { ok: false, error: "type" };
  let body: Blob = file;
  let type = mime;
  let name = file.name;
  if ((mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") && file.size > 0) {
    const blob = await shrinkToJpeg(file, 1600);
    if (!blob) return { ok: false, error: "decode" };
    body = blob;
    type = "image/jpeg";
    name = name.replace(/\.[^.]+$/, "") + ".jpg";
  }
  if (body.size > FILE_LIMIT || body.size < 1) return { ok: false, error: "size" };
  const supabase = createSupabaseBrowser();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "auth" };
  const path = `${data.user.id}/${crypto.randomUUID().replace(/-/g, "")}.${EXT_BY_MIME[type]}`;
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, body, { contentType: type, cacheControl: "3600" });
  return error ? { ok: false, error: "upload" } : { ok: true, file: { path, name: name.slice(0, 160), mime: type, size: body.size } };
}
