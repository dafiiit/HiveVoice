"use server";
import { revalidatePath } from "next/cache";
import { sql, errorCode } from "../db";
import { run } from "../action";
import { adminState, viaAdminGate } from "../admin";
import { getSession } from "../session";

async function guard<T>(fn: () => Promise<T>) {
  const s = await adminState();
  if (!s.allowed) return { ok: false as const, error: "forbidden" };
  try {
    const data = await fn();
    revalidatePath("/sysadmin");
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: errorCode(e) };
  }
}

/** The first person to open the secret admin path while no admin exists becomes admin. */
export async function claimAdmin() {
  if (!(await viaAdminGate())) return { ok: false as const, error: "forbidden" };
  const session = await getSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.server_admins`;
  if (n > 0) return { ok: false as const, error: "forbidden" };
  await sql`select app.admin_grant(${session.profile.id}, true)`;
  revalidatePath("/sysadmin");
  return { ok: true as const, data: null };
}

export async function setVerificationMode(mode: "login" | "vouch" | "eid") {
  return guard(() => sql`select app.admin_set_setting('verification_mode', ${sql.json(mode)})`);
}

export async function setRegistrationMode(mode: "open" | "invite") {
  return guard(() => sql`select app.admin_set_setting('registration_mode', ${sql.json(mode)})`);
}

export async function addDomain(domain: string, label: string) {
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return { ok: false as const, error: "invalid" };
  return guard(() => sql`select app.admin_add_domain(${d}, ${label.trim() || d})`);
}

export async function removeDomain(domain: string) {
  return guard(() => sql`select app.admin_remove_domain(${domain})`);
}

/** With more than one admin a second admin has to agree: the answer is "done" or "pending". */
export async function grantAdmin(profileRef: string, on: boolean) {
  const id = profileRef.match(/[0-9a-f-]{36}/)?.[0];
  if (!id) return { ok: false as const, error: "invalid" };
  const res = await run(async (tx) => (await tx<{ r: string }[]>`select app.admin_action(${on ? "grant_admin" : "revoke_admin"}, ${id}, '') as r`)[0].r);
  revalidatePath("/sysadmin");
  return res;
}

export async function banPerson(profileRef: string, reason: string) {
  const id = profileRef.match(/[0-9a-f-]{36}/)?.[0];
  if (!id) return { ok: false as const, error: "invalid" };
  const res = await run(async (tx) => (await tx<{ r: string }[]>`select app.admin_action('ban', ${id}, ${reason}) as r`)[0].r);
  revalidatePath("/sysadmin");
  return res;
}

export async function decideProposal(id: string, approve: boolean) {
  const res = await run(async (tx) => { await tx`select app.decide_admin_proposal(${id}, ${approve})`; return null; });
  revalidatePath("/sysadmin");
  return res;
}

export async function decideEmergency(reportId: string, upheld: boolean, reason: string) {
  const res = await run(async (tx) => { await tx`select app.decide_emergency(${reportId}, ${upheld}, ${reason})`; return null; });
  revalidatePath("/sysadmin");
  return res;
}

export async function logDisclosure(reference: string, authority: string, scope: string) {
  const res = await run(async (tx) => { await tx`select app.log_disclosure(${reference}, ${authority}, ${scope})`; return null; });
  revalidatePath("/sysadmin");
  return res;
}

export async function setDemoChats(on: boolean) {
  return guard(() => sql`select app.admin_set_setting('demo_chats', ${sql.json(on)})`);
}

export async function purgeDemo() {
  return guard(async () => {
    const [{ n }] = await sql<{ n: number }[]>`select app.admin_purge_demo() as n`;
    return n;
  });
}
