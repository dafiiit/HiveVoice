import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { TOUCH_COOKIE, cookieOptions } from "./lib/supabase/options";
import { touchSession } from "./lib/supabase/touch";
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
  // Once a day the session cookies are written again from the server (see touch.ts).
  if (claims && !refreshed && !request.cookies.has(TOUCH_COOKIE)) touchSession(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|drawio/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
