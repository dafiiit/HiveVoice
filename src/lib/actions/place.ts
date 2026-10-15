"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { asViewer } from "../db";
import { PLACE_COOKIE } from "../place";

/** Guests keep their place in a cookie only. Passing null forgets it. */
export async function setGuestPlace(regionId: string | null) {
  const store = await cookies();
  if (!regionId) {
    store.delete(PLACE_COOKIE);
  } else {
    if (!/^[0-9a-f-]{36}$/.test(regionId)) return { ok: false as const, error: "invalid" };
    const found = await asViewer(null, (tx) => tx`select 1 from public.regions where id = ${regionId}`);
    if (!found.length) return { ok: false as const, error: "not_found" };
    store.set(PLACE_COOKIE, regionId, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  }
  revalidatePath("/", "layout");
  return { ok: true as const, data: null };
}
