"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

/** Sets or clears the profile photo. The database checks that the file sits in the member's own folder. */
export async function setAvatar(path: string | null) {
  const res = await run(async (tx) => {
    await tx`select app.set_avatar(${path})`;
    return null;
  });
  revalidatePath("/", "layout");
  return res;
}
