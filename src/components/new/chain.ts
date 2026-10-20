import "server-only";
import type { Tx } from "@/lib/db";

/** The places of a person from near to far, for the place picker of the forms. */
export async function newChain(tx: Tx, profileId: string) {
  return tx<{ id: string; name: string; level: string }[]>`
    select r.id, r.name, r.level::text from public.user_regions ur join public.regions r on r.id = ur.region_id where ur.profile_id = ${profileId}
    order by array_position(array['borough','municipality','district','state','country'], r.level::text)`;
}
