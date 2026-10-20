import "server-only";
import { headers } from "next/headers";
import { sql } from "./db";
import { getSession } from "./session";
import { adminEmails } from "./admin-emails";

export { adminEmails };

/** True only for requests that came in through the secret ADMIN_PATH (see proxy.ts). */
export async function viaAdminGate() {
  const gate = (await headers()).get("x-hv-admin-gate");
  return !!process.env.ADMIN_PATH && gate === process.env.ADMIN_PATH;
}

/** Brings public.server_admins in line with ADMIN_EMAILS (only confirmed addresses count). */
export async function syncAdmins() {
  await sql`select app.sync_server_admins(${adminEmails()}::text[])`;
}

/**
 * Two-factor login for admins. Off until ADMIN_REQUIRE_MFA=1 is set; then the admin page and
 * every admin action need a session that passed a second factor (Supabase "aal2").
 */
export function adminNeedsMfa() {
  return process.env.ADMIN_REQUIRE_MFA === "1";
}

export async function adminState() {
  if (!(await viaAdminGate())) return { allowed: false as const, reason: "gate" as const };
  const session = await getSession();
  if (!session) return { allowed: false as const, reason: "login" as const };
  await syncAdmins();
  const [{ admin }] = await sql<{ admin: boolean }[]>`select exists (select 1 from public.server_admins where profile_id = ${session.profile.id}) as admin`;
  if (!admin) return { allowed: false as const, reason: adminEmails().length ? ("forbidden" as const) : ("unconfigured" as const) };
  if (adminNeedsMfa() && session.aal !== "aal2") return { allowed: false as const, reason: "mfa" as const, session };
  return { allowed: true as const, session };
}
