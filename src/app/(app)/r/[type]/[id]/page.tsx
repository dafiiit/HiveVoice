import { notFound, redirect } from "next/navigation";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isRefType, loadRefCards } from "@/lib/refs";

// A stable address for anything that can be passed on (/r/listing/<id>, /r/task/<id> ...): leads to its page,
// read with the viewer's rights. Used where only type and id are known, e.g. in notifications.
export default async function RefRedirect({ params, searchParams }: PageProps<"/r/[type]/[id]">) {
  const { type, id } = await params;
  const k = (await searchParams).k;
  if (!isRefType(type) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const token = typeof k === "string" ? k : null;
  const cards = await asViewer(viewer, (tx) => loadRefCards(tx, [{ type, id }]), { linkToken: token });
  const card = cards.get(`${type}:${id}`);
  if (!card) notFound();
  if (!token) redirect(card.href);
  const [path, hash] = card.href.split("#");
  redirect(`${path}${path.includes("?") ? "&" : "?"}k=${encodeURIComponent(token)}${hash ? `#${hash}` : ""}`);
}
