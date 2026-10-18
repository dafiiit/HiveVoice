import "server-only";
import { createSupabaseServer } from "./supabase/server";
import { FILE_BUCKET } from "./files";

/**
 * Removes stored files whose database rows are gone. Best effort: the store only lets people remove files in their
 * own folder, so a file that someone else's moderation removed may stay behind.
 */
export async function purgeFiles(paths: string[]) {
  if (!paths.length) return;
  try {
    const supabase = await createSupabaseServer();
    await supabase.storage.from(FILE_BUCKET).remove(paths);
  } catch {
    // The row is gone either way; an unreferenced file does no harm.
  }
}
