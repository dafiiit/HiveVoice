import "server-only";
import { headers } from "next/headers";
import { sql } from "./db";
import { getSession } from "./session";

/** True only for requests that came in through the secret ADMIN_PATH (see proxy.ts). */
export async function viaAdminGate() {
  const gate = (await headers()).get("x-hv-admin-gate");
  return !!process.env.ADMIN_PATH && gate === process.env.ADMIN_PATH;
}

export async function adminState() {
  if (!(await viaAdminGate())) return { allowed: false as const, reason: "gate" as const };
  const session = await getSession();
  if (!session) return { allowed: false as const, reason: "login" as const };
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.server_admins`.catch(() => [{ n: -1 }]);
  if (session.profile.is_admin) return { allowed: true as const, session, bootstrap: false };
  if (n === 0) return { allowed: false as const, reason: "bootstrap" as const, session };
  return { allowed: false as const, reason: "forbidden" as const };
}
