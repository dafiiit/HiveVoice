import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { TOUCH_COOKIE, cookieOptions } from "./lib/supabase/options";
import { verifiedClaims } from "./lib/supabase/claims";

export async function proxy(request: NextRequest) {
  // The request the page sees. It is built from the request as it is right now, so cookies
  // refreshed below reach the page too (otherwise it would refresh the old token a second time).
  const forward = () => {
    const headers = new Headers(request.headers);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  let refreshed = false;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        refreshed = true;
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Refreshes an expired session token and hands the new cookies to the browser; do not remove.
  const claims = await verifiedClaims(supabase);
  // Safari keeps cookies that scripts write (the browser client renews the session that way) for only seven days.
  // Writing the session cookies again from the server, once a day, keeps people signed in on their device.
  if (claims && !refreshed && !request.cookies.has(TOUCH_COOKIE)) {
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) response.cookies.set(c.name, c.value, cookieOptions);
    }
    response.cookies.set(TOUCH_COOKIE, "1", { ...cookieOptions, maxAge: 60 * 60 * 24, httpOnly: true });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
