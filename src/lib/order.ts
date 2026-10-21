import "server-only";
import { cookies } from "next/headers";
import { ORDER_COOKIE } from "@/i18n/config";

/** The order every list uses, chosen once in the settings (a cookie, saved with the account). */
export async function feedOrder(): Promise<"chrono" | "suggested"> {
  return (await cookies()).get(ORDER_COOKIE)?.value === "suggested" ? "suggested" : "chrono";
}
