import { notFound, redirect } from "next/navigation";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * A list is a note with tasks. An old list address opens its note; a list made before the change is turned into one first
 * (only the owner's own lists, see app.my_list_note).
 */
export default async function OldList({ params, searchParams }: PageProps<"/me/lists/[id]">) {
  const { id } = await params;
  const k = (await searchParams).k;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const note = await asViewer(viewer, async (tx) => (await tx<{ n: string | null }[]>`select app.my_list_note(${id}) as n`)[0]?.n ?? null);
  if (!note) notFound();
  redirect(`/me/notes/${note}${typeof k === "string" && /^[0-9a-f]{32}$/.test(k) ? `?k=${k}` : ""}`);
}
