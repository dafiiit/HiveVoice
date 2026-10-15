import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { sql, type Viewer } from "./db";
import { createSupabaseServer } from "./supabase/server";

export type SessionProfile = {
  id: string;
  display_name: string;
  alias: string | null;
  real_name: string | null;
  display_mode: "real" | "alias";
  avatar_seed: number;
  avatar_path: string | null;
  onboarded: boolean;
  verified: boolean;
  home_region_id: string | null;
  home_region: { name: string; level: string } | null;
  is_admin: boolean;
  settings: { language: string; easy_language: boolean; theme: string } | null;
  unread: number;
};

export type Session = { authId: string; email: string | null; profile: SessionProfile };

/** The signed-in person, or null for guests. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string; user_metadata?: Record<string, string> } | undefined;
  if (!claims?.sub) return null;
  let [row] = await sql<{ p: SessionProfile | null }[]>`select app.session_profile(${claims.sub}) as p`;
  if (!row.p) {
    const name = claims.user_metadata?.full_name ?? claims.user_metadata?.name ?? "";
    await sql`select app.ensure_profile(${claims.sub}, ${name})`;
    [row] = await sql<{ p: SessionProfile | null }[]>`select app.session_profile(${claims.sub}) as p`;
  }
  return row.p ? { authId: claims.sub, email: claims.email ?? null, profile: row.p } : null;
});

export async function getViewer(): Promise<Viewer> {
  const s = await getSession();
  return s ? { authId: s.authId, profileId: s.profile.id } : null;
}

/** For pages and actions that need a signed-in, onboarded person. */
export async function requireSession(next?: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!s.profile.onboarded) redirect("/onboarding");
  return s;
}
