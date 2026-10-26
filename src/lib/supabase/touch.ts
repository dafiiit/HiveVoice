import type { NextRequest, NextResponse } from "next/server";
import { TOUCH_COOKIE, cookieAttributes } from "./options";

/**
 * Safari keeps cookies that scripts write (the browser client renews the session that way) for only seven days.
 * Writing the session cookies again from the server, once a day, keeps people signed in on their device.
 * The session cookies go back under their own names and values (also when split into `.0`, `.1`); the marker
 * cookie only says "done today".
 */
export function touchSession(request: NextRequest, response: NextResponse) {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) response.cookies.set(c.name, c.value, cookieAttributes);
  }
  response.cookies.set(TOUCH_COOKIE, "1", { ...cookieAttributes, maxAge: 60 * 60 * 24, httpOnly: true });
}
