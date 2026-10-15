import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ADMIN_GATE = "x-hv-admin-gate";

export async function proxy(request: NextRequest) {
  const adminPath = process.env.ADMIN_PATH;
  const { pathname } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete(ADMIN_GATE);

  // The admin page has no public route. It is reachable only under the secret
  // path from ADMIN_PATH, which is rewritten to /sysadmin internally.
  let rewrite: URL | null = null;
  if (pathname.startsWith("/sysadmin")) {
    rewrite = new URL("/not-found-page", request.url);
  } else if (adminPath && (pathname === `/${adminPath}` || pathname.startsWith(`/${adminPath}/`))) {
    rewrite = new URL(pathname.replace(`/${adminPath}`, "/sysadmin") + request.nextUrl.search, request.url);
    headers.set(ADMIN_GATE, adminPath);
  }

  let response = rewrite
    ? NextResponse.rewrite(rewrite, { request: { headers } })
    : NextResponse.next({ request: { headers } });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = rewrite
          ? NextResponse.rewrite(rewrite, { request: { headers } })
          : NextResponse.next({ request: { headers } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Refreshes an expired session token; do not remove.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
