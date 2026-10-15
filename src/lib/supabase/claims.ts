import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The signing keys of the login service change rarely. Keeping them for ten minutes
// saves a network call on every request, and a short outage of that call can no longer
// look like "signed out".
const TTL = 10 * 60 * 1000;
let cache: { keys: JsonWebKey[]; at: number } | null = null;

async function keys(force = false) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.keys;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  cache = { keys: ((await res.json()) as { keys: JsonWebKey[] }).keys, at: Date.now() };
  return cache.keys;
}

type Claims = { sub?: string; email?: string; user_metadata?: Record<string, string> };

/**
 * The signed-in person's verified claims, or null. Refreshes an expired session on the way
 * (the proxy stores the new cookies). If the signature check cannot run, the login service
 * itself is asked, so a hiccup does not sign anyone out.
 */
export async function verifiedClaims(supabase: SupabaseClient): Promise<Claims | null> {
  const auth = supabase.auth as unknown as {
    getClaims: (jwt?: string, o?: { keys?: JsonWebKey[] }) => Promise<{ data: { claims: Claims } | null; error: unknown }>;
  };
  let res = await auth.getClaims(undefined, { keys: await keys().catch(() => []) }).catch(() => null);
  // A key we do not know yet: the keys were rotated. Look once more.
  if (res?.error && /signing key|jwks/i.test(String((res.error as { message?: string }).message))) {
    res = await auth.getClaims(undefined, { keys: await keys(true).catch(() => []) }).catch(() => null);
  }
  if (res?.data?.claims) return res.data.claims;
  if (res?.error && (res.error as { name?: string }).name !== "AuthSessionMissingError") {
    const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (data.user) return { sub: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata as Record<string, string> };
  }
  return null;
}
