"use server";
import { cookies } from "next/headers";
import { LAST_LOGIN_COOKIE } from "../supabase/options";

/** "Another account": forget who signed in last on this device. */
export async function forgetLastLogin() {
  (await cookies()).delete(LAST_LOGIN_COOKIE);
}
