// Signing in the test account. The login form is protected by a captcha (Cloudflare Turnstile) that a test browser
// cannot solve, so with SUPABASE_SERVICE_ROLE_KEY set the tests sign in through a one-time magic-link token instead:
// the admin API issues the token, verifying it creates the session, and the session goes into the same cookie the
// app sets. Without the key (an instance without captcha) the tests use the real form.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

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

/** Session cookies of the test account, as the app's server client would write them. */
async function sessionCookies() {
  const jar = new Map<string, string>();
  const sb = createServerClient(url, anon, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))) },
  });
  const { error } = await sb.auth.verifyOtp({ token_hash: await tokenHash(), type: "magiclink" });
  if (error) throw error;
  return [...jar].map(([name, value]) => ({ name, value }));
}

export async function login(page: Page) {
  if (service) {
    const base = new URL(page.url().startsWith("http") ? page.url() : (process.env.E2E_BASE_URL ?? "http://localhost:3000"));
    await page.context().addCookies((await sessionCookies()).map((c) => ({ ...c, url: base.origin, sameSite: "Lax" as const, expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 400 })));
    await page.goto("/connect");
    await page.waitForURL(/\/(connect|onboarding)/);
    return;
  }
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email());
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}

/** A Supabase client signed in as the test account, for cleaning up stored files. */
export async function testClient(): Promise<SupabaseClient> {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  if (service) await sb.auth.verifyOtp({ token_hash: await tokenHash(), type: "magiclink" });
  else await sb.auth.signInWithPassword({ email: email(), password: process.env.TEST_USER_PASSWORD! });
  return sb;
}
