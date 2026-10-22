import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { LinkView } from "@/app/(app)/links/[id]/page";
import { ListView } from "@/app/(app)/me/lists/[id]/page";
import { InitiativeView } from "@/app/(app)/initiatives/[id]/page";
import { ListingDetail } from "@/components/listings/ListingDetail";

export async function generateMetadata() {
  return { title: (await getTranslations("mine"))("title") };
}

// Old links: /me/notes and the like lead to the sections.
const OLD: Record<string, string> = { notes: "/me/notes", diagrams: "/me/diagrams", docs: "/me/notes", uploads: "/me/uploads", lists: "/me/lists", projects: "/me/initiatives", listings: "/me/listings" };
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Ich → Überblick: everything of mine in one list. An item opens next to it and the overview stays the place
 * one is in (`?o=kind:id`), instead of jumping to the section the item belongs to.
 */
export default async function Mine({ searchParams }: PageProps<"/me">) {
  const sp = await searchParams;
  if (typeof sp.f === "string" && OLD[sp.f]) redirect(OLD[sp.f]);
  const [kind, id] = typeof sp.o === "string" ? sp.o.split(":") : [];
  if (!id || !UUID.test(id)) return <MineSection kind="all" open={false} />;
  const detail =
    kind === "notes" || kind === "diagrams" || kind === "uploads" ? <LinkView id={id} sp={sp} base={`/me/${kind}/${id}`} embedded />
    : kind === "lists" ? <ListView id={id} embedded />
    : kind === "listings" ? <ListingDetail id={id} embedded />
    : kind === "projects" ? <InitiativeView id={id} sp={sp} base={`/me/initiatives/${id}`} embedded />
    : null;
  if (!detail) return <MineSection kind="all" open={false} />;
  return <MineSection kind="all" selected={id} open detail={detail} />;
}
