import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { TOUCH_COOKIE, cookieAttributes, cookieOptions } from "../src/lib/supabase/options";
import { touchSession } from "../src/lib/supabase/touch";

const SESSION = cookieOptions.name;

const requestWith = (cookies: Record<string, string>) =>
  new NextRequest("http://localhost/me", { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });

describe("touchSession (the daily rewrite of the login cookies)", () => {
  it("keeps the session cookie under its own name and value, and adds the marker next to it", () => {
    const response = NextResponse.next();
    touchSession(requestWith({ [SESSION]: "base64-abc" }), response);
    expect(response.cookies.get(SESSION)?.value).toBe("base64-abc");
    expect(response.cookies.get(TOUCH_COOKIE)?.value).toBe("1");
    expect(response.cookies.getAll().map((c) => c.name).sort()).toEqual([SESSION, TOUCH_COOKIE].sort());
    // What the browser receives: the marker is its own cookie and nothing sets the session cookie to "1".
    const sent = response.headers.getSetCookie().map((h) => h.split(";")[0]);
    expect(sent).toEqual([`${SESSION}=base64-abc`, `${TOUCH_COOKIE}=1`]);
  });

  it("keeps a session split into chunks as it is", () => {
    const response = NextResponse.next();
    touchSession(requestWith({ [`${SESSION}.0`]: "part-one", [`${SESSION}.1`]: "part-two", other: "x" }), response);
    expect(response.cookies.get(`${SESSION}.0`)?.value).toBe("part-one");
    expect(response.cookies.get(`${SESSION}.1`)?.value).toBe("part-two");
    expect(response.cookies.get("other")).toBeUndefined();
    expect(response.cookies.get(SESSION)).toBeUndefined();
  });

  it("only the marker is short-lived and hidden from scripts; the session cookies live as long as set in options", () => {
    const response = NextResponse.next();
    touchSession(requestWith({ [SESSION]: "base64-abc" }), response);
    expect(response.cookies.get(TOUCH_COOKIE)).toMatchObject({ httpOnly: true, maxAge: 60 * 60 * 24 });
    expect(response.cookies.get(SESSION)).toMatchObject({ maxAge: cookieAttributes.maxAge, path: "/", sameSite: "lax" });
    expect(response.cookies.get(SESSION)?.httpOnly).toBeFalsy();
  });
});

describe("cookie options", () => {
  it("the attributes have no name, since a name there would replace the name of whatever cookie they are given to", () => {
    expect(cookieAttributes).not.toHaveProperty("name");
    expect(cookieOptions.name).toMatch(/^sb-.+-auth-token$/);
  });
});
