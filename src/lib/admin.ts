import "server-only";
import { sql } from "./db";
import { getSession } from "./session";
import { adminEmails } from "./admin-emails";

export { adminEmails };

/**
 * Brings public.server_admins in line with ADMIN_EMAILS (only confirmed addresses count).
 * A server without ADMIN_EMAILS (a preview deployment, a local copy) leaves the list alone:
 * otherwise opening such a deployment would take the admins' rights away on the shared database.
 */
export async function syncAdmins() {
  if (adminEmails().length === 0) return;
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
  const session = await getSession();
  if (!session) return { allowed: false as const, reason: "login" as const };
  await syncAdmins();
  const [{ admin }] = await sql<{ admin: boolean }[]>`select exists (select 1 from public.server_admins where profile_id = ${session.profile.id}) as admin`;
  if (!admin) return { allowed: false as const, reason: adminEmails().length ? ("forbidden" as const) : ("unconfigured" as const) };
  if (adminNeedsMfa() && session.aal !== "aal2") return { allowed: false as const, reason: "mfa" as const, session };
  return { allowed: true as const, session };
}
