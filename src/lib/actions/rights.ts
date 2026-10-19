"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

/** Vouch for a person (or take the vouch back). */
export async function vouch(profileId: string, on: boolean) {
  const res = await run(async (tx) => {
    if (on) await tx`select app.vouch_for(${profileId})`;
    else await tx`select app.unvouch(${profileId})`;
    return null;
  });
  revalidatePath(`/profile/${profileId}`);
  return res;
}

/** The reason why an action is not possible, from the same rule the database uses ("Warum geht das nicht?"). */
export async function explainAction(action: string, objectId: string | null) {
  return run(async (tx) => {
    const [{ c }] = await tx<{ c: { allowed: boolean; reason: string | null } }[]>`select app.can(${action}, ${objectId}::uuid) as c`;
    return c;
  });
}
