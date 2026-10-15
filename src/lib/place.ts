import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { asViewer } from "./db";
import { getSession } from "./session";
import { placeChain, type PlaceStep } from "./queries";

export const PLACE_COOKIE = "hv-place";

export type Place = { id: string; name: string; level: string; chain: PlaceStep[]; source: "member" | "guest" };

/**
 * The place the app centres on: a member's home place, or for guests the place
 * they picked (kept in a cookie, never on the server). Cached per request.
 */
export const getPlace = cache(async (): Promise<Place | null> => {
  const session = await getSession();
  let id = session?.profile.home_region_id ?? null;
  let source: Place["source"] = "member";
  if (!session) {
    const value = (await cookies()).get(PLACE_COOKIE)?.value;
    if (value && /^[0-9a-f-]{36}$/.test(value)) { id = value; source = "guest"; }
  }
  if (!id) return null;
  const chain = await asViewer(null, (tx) => placeChain(tx, id));
  const self = chain.find((r) => r.id === id);
  return self ? { id, name: self.name, level: self.level, chain, source } : null;
});
