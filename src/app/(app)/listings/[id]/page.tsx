import { redirect } from "next/navigation";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ListingDetail } from "@/components/listings/ListingDetail";

/** One offer or one wanted post; which of the two it is, the listing itself says. */
export default async function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const k = (await searchParams).k;
  // Opened with a link key: stays here. Otherwise my own listings open in Ich, the others in Gemeinschaft, next to the list.
  if (typeof k !== "string" && /^[0-9a-f-]{36}$/.test(id)) {
    const session = await getSession();
    const [l] = await asViewer(session ? { authId: session.authId, profileId: session.profile.id } : null, (tx) =>
      tx<{ own: boolean }[]>`select owner_id = ${session?.profile.id ?? null}::uuid as own from public.listings where id = ${id}`);
    if (l) redirect(l.own ? `/me/listings/${id}` : `/community/listings/${id}`);
  }
  return <ListingDetail id={id} linkToken={typeof k === "string" ? k : null} />;
}
