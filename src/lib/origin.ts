import "server-only";
import { headers } from "next/headers";

/**
 * The address this request came in on (behind Vercel's proxy and a self-hosted gateway too), for links people copy and for
 * redirects: the request's own URL inside a container is the server's (http://0.0.0.0:3000), not the one people opened.
 */
export async function getOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
}
