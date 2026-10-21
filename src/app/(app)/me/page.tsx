import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";

export async function generateMetadata() {
  return { title: (await getTranslations("mine"))("title") };
}

// Old links: /me/notes and the like lead to the sections.
const OLD: Record<string, string> = { notes: "/me/notes", docs: "/me/notes", uploads: "/me/uploads", lists: "/me/lists", projects: "/me/initiatives", listings: "/me/listings" };

export default async function Mine({ searchParams }: PageProps<"/me">) {
  const f = (await searchParams).f;
  if (typeof f === "string" && OLD[f]) redirect(OLD[f]);
  return <MineSection kind="all" open={false} />;
}
