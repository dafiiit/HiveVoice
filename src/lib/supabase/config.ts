// Where the login and file services (Supabase Auth and Storage) are, and the public key for them.
// On Supabase's cloud both are fixed when the app is built (NEXT_PUBLIC_…). A self-hosted instance sets them when it starts
// instead, so one image runs under any address (selfhost/): SUPABASE_PUBLIC_URL and SUPABASE_ANON_KEY reach the browser
// through the root layout (window.__hvSupabase), and SUPABASE_INTERNAL_URL is how this server reaches them inside Docker.

declare global {
  interface Window { __hvSupabase?: { url: string; key: string } }
}

/** For the browser: the address people's devices use. */
export function publicSupabaseUrl(): string {
  if (typeof window !== "undefined") return window.__hvSupabase?.url || process.env.NEXT_PUBLIC_SUPABASE_URL!;
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
  return process.env.SUPABASE_PUBLIC_URL && process.env.SUPABASE_ANON_KEY ? { url: process.env.SUPABASE_PUBLIC_URL, key: process.env.SUPABASE_ANON_KEY } : null;
}
