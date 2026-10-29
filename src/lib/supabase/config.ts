// Where the login and file services (Supabase Auth and Storage) are, and the public key for them.
// On Supabase's cloud both are fixed when the app is built (NEXT_PUBLIC_…). A self-hosted instance sets them when it starts
// instead, so one image runs under any address (selfhost/): SUPABASE_PUBLIC_URL and SUPABASE_ANON_KEY reach the browser
// through the root layout (window.__hvSupabase), and SUPABASE_INTERNAL_URL is how this server reaches them inside Docker.

declare global {
  interface Window { __hvSupabase?: { url: string; key: string } }
}

/** Login and files under the page's own address (selfhost/: one gateway for everything), whatever address it was opened under. */
const sameOrigin = () => process.env.SUPABASE_SAME_ORIGIN === "1";

/**
 * For the browser: the address people's devices use. On a self-hosted instance that is the page's own address, so it
 * works the same through the home network address, localhost or a tunnel (another address would be a cross-origin call).
 */
export function publicSupabaseUrl(): string {
  if (typeof window !== "undefined") {
    const cfg = window.__hvSupabase;
    if (cfg && !cfg.url) return window.location.origin;
    return cfg?.url || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  }
  // In pages drawn on the server (picture addresses): a path, which the browser reads against the page's address.
  if (sameOrigin()) return "";
  return process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/** For calls from this server: inside a Docker network the service's own name, otherwise the public address. */
export function serverSupabaseUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL || process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/** The public (anon / publishable) key; it is meant to be known, the rules in the database protect the data. */
export function supabaseKey(): string {
  if (typeof window !== "undefined") return window.__hvSupabase?.key || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
}

/** What the root layout hands to the browser, when the instance sets it at start (null on the cloud setup). */
export function runtimeSupabase(): { url: string; key: string } | null {
  if (!process.env.SUPABASE_ANON_KEY || !(process.env.SUPABASE_PUBLIC_URL || sameOrigin())) return null;
  return { url: sameOrigin() ? "" : process.env.SUPABASE_PUBLIC_URL!, key: process.env.SUPABASE_ANON_KEY };
}
