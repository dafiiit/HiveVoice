"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

export async function markAllRead() {
  const res = await run(async (tx, s) => {
    await tx`update public.notifications set read_at = now() where profile_id = ${s.profile.id} and read_at is null`;
    return null;
  });
  revalidatePath("/", "layout");
  return res;
}
