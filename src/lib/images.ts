// Where uploaded photos are served from. The database stores only the path
// ("<auth user id>/<file>"), so a self-hosted instance can point
// NEXT_PUBLIC_IMAGE_BASE_URL at any S3-compatible store or CDN.
const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images`;

export const IMAGE_BUCKET = "images";
export const MAX_LISTING_IMAGES = 4;

export function imageUrl(path?: string | null): string | null {
  return path ? `${base}/${path}` : null;
}
