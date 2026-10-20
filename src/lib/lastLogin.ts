import "server-only";
import { cookies } from "next/headers";
import { LAST_LOGIN_COOKIE } from "./supabase/options";

export type LastLogin = { provider: string; email: string };

/** Who signed in last on this device, if anyone (set by /auth/callback). */
export async function lastLogin(): Promise<LastLogin | null> {
  const raw = (await cookies()).get(LAST_LOGIN_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString()) as { p?: unknown; e?: unknown };
    return typeof v.p === "string" && typeof v.e === "string" && v.e.includes("@") ? { provider: v.p, email: v.e.slice(0, 200) } : null;
  } catch {
    return null;
  }
}
