import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { EASY_COOKIE, LANG_COOKIE, THEME_COOKIE } from "@/i18n/config";
import { LAST_LOGIN_COOKIE } from "@/lib/supabase/options";

// Finishes OAuth and email confirmation (PKCE code), creates the profile on
// first sign-in and restores the person's language and theme.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/friends";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/friends";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", url.origin));

  const store = await cookies();
  const year = 60 * 60 * 24 * 365;
  // Remember how this person signs in, for "continue as …" on the next visit to the login page.
  const { data } = await (await createSupabaseServer()).auth.getUser().catch(() => ({ data: { user: null } }));
  if (data.user?.email) {
    const provider = String(data.user.app_metadata?.provider ?? "email");
    const value = Buffer.from(JSON.stringify({ p: provider, e: data.user.email })).toString("base64url");
    store.set(LAST_LOGIN_COOKIE, value, { maxAge: 60 * 60 * 24 * 400, path: "/", httpOnly: true, sameSite: "lax", secure: url.protocol === "https:" });
  }
  const s = session.profile.settings;
  if (s) {
    store.set(LANG_COOKIE, s.language, { maxAge: year, path: "/" });
    store.set(EASY_COOKIE, s.easy_language ? "1" : "0", { maxAge: year, path: "/" });
    store.set(THEME_COOKIE, s.theme, { maxAge: year, path: "/" });
  }
  const dest = session.profile.onboarded ? (next === "/onboarding" ? "/friends" : next) : "/onboarding";
  return NextResponse.redirect(new URL(dest, url.origin));
}
