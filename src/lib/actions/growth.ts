"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { asViewer } from "../db";

export async function createInviteCode() {
  const res = await run(async (tx) => (await tx<{ c: string }[]>`select app.create_invite_code() as c`)[0].c);
  revalidatePath("/sharing");
  return res;
}

export async function revokeInviteCode(code: string) {
  const res = await run(async (tx) => { await tx`select app.revoke_invite_code(${code})`; return null; });
  revalidatePath("/sharing");
  return res;
}

export async function redeemInviteCode(code: string) {
  const res = await run(async (tx) => { await tx`select app.redeem_invite_code(${code})`; return null; });
  revalidatePath("/", "layout");
  return res;
}

export async function mintInviteCodes(n: number) {
  return run(async (tx) => (await tx<{ c: string[] }[]>`select app.mint_invite_codes(${n}) as c`)[0].c);
}

/** Disposable mail domains are not accepted for new accounts. */
export async function emailAllowed(email: string) {
  const [{ ok }] = await asViewer(null, (tx) => tx<{ ok: boolean }[]>`select app.email_allowed(${email.trim().toLowerCase()}) as ok`);
  return ok;
}
