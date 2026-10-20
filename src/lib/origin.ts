import "server-only";
import { headers } from "next/headers";

/** The address this request came in on (behind Vercel's proxy too), for links people copy. */
export async function getOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
}
