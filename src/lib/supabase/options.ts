// One place for how the login cookie behaves: it lives for more than a year, so people
// stay signed in on their device, and it is only sent over https in production.
// Who signed in last on this device and how (provider and e-mail), so the login page can offer "continue as …".
// Only on the device, never sent anywhere else; "another account" clears it.
export const LAST_LOGIN_COOKIE = "hv-last-login";
// Set once a day by the proxy when it writes the session cookies again from the server (see proxy.ts).
export const TOUCH_COOKIE = "hv-touch";

// Supabase names the session cookie after the first part of its address (sb-<ref>-auth-token).
// Fixed here so a custom domain for Supabase (auth.example.org) does not sign everyone out.
const SESSION_COOKIE = "sb-wpfkxekiumonxmscwcvc-auth-token";

// How every cookie we write behaves. No name in here: passed to `response.cookies.set(name, value, …)`, a `name`
// in the options would replace the cookie's own name (the session cookie was once overwritten that way).
export const cookieAttributes = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.NODE_ENV === "production",
};

// For the Supabase clients, which take the session cookie's name from here.
export const cookieOptions = { name: SESSION_COOKIE, ...cookieAttributes };
