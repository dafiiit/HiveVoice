// Signing in the test account. The login form is protected by a captcha (Cloudflare Turnstile) that a test browser
// cannot solve, so with SUPABASE_SERVICE_ROLE_KEY set the tests sign in through a one-time magic-link token instead:
// the admin API issues the token, verifying it creates the session, and the session goes into the same cookie the
// app sets. Without the key (an instance without captcha) the tests use the real form.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = () => process.env.TEST_USER_EMAIL!;

async function tokenHash() {
  const admin = createClient(url, service!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: email() });
  if (error) throw error;
  return data.properties.hashed_token;
}

// Supabase limits how many magic links may be issued, so one session serves the whole run (it lasts an hour; the
// run takes minutes). It is kept in a file because every Playwright worker is its own process.
const CACHE = "test-results/.auth-session.json";
type Cached = { at: number; cookies: { name: string; value: string }[]; access_token: string; refresh_token: string };

async function session(fresh = false): Promise<Cached> {
  if (!fresh) try {
    const c = JSON.parse(readFileSync(CACHE, "utf8")) as Cached;
    if (Date.now() - c.at < 40 * 60_000) return c;
  } catch { /* no session yet */ }
  const jar = new Map<string, string>();
  const sb = createServerClient(url, anon, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))) },
  });
  const { data, error } = await sb.auth.verifyOtp({ token_hash: await tokenHash(), type: "magiclink" });
  if (error || !data.session) throw error ?? new Error("no session");
  const c: Cached = { at: Date.now(), cookies: [...jar].map(([name, value]) => ({ name, value })), access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  if (!fresh) {
    mkdirSync("test-results", { recursive: true });
    writeFileSync(CACHE, JSON.stringify(c));
  }
  return c;
}

/**
 * /friends opens for guests too, so the address says nothing about being signed in: a session the app did not accept
 * (expired, wrong cookie name) ends as a guest, and every test after it fails somewhere far from the cause.
 */
async function expectSignedIn(page: Page) {
  if (await page.getByText("Du liest als Gast").count()) {
    throw new Error("Login failed: the app shows the guest page after signing in (session cookie not accepted, see src/proxy.ts and src/lib/supabase/options.ts).");
  }
}

/** Signs in the test account. `fresh`: an own session, for a test that renews or ends it (the shared one must stay valid). */
export async function login(page: Page, opts: { fresh?: boolean } = {}) {
  if (service) {
    const base = new URL(page.url().startsWith("http") ? page.url() : (process.env.E2E_BASE_URL ?? "http://localhost:3000"));
    await page.context().addCookies((await session(opts.fresh)).cookies.map((c) => ({ ...c, url: base.origin, sameSite: "Lax" as const, expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 400 })));
    await page.goto("/friends");
    await page.waitForURL(/\/(friends|onboarding)/);
    await expectSignedIn(page);
    return;
  }
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email());
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(friends|onboarding)/);
  await expectSignedIn(page);
}

/** A Supabase client signed in as the test account, for cleaning up stored files. */
export async function testClient(): Promise<SupabaseClient> {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  if (service) {
    const c = await session();
    await sb.auth.setSession({ access_token: c.access_token, refresh_token: c.refresh_token });
  }
  else await sb.auth.signInWithPassword({ email: email(), password: process.env.TEST_USER_PASSWORD! });
  return sb;
}
