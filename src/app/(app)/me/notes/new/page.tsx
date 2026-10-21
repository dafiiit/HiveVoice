import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { NewDoc } from "@/components/mine/NewDoc";

export async function generateMetadata() {
  return { title: (await getTranslations("mine"))("newDocTitle") };
}

export default async function NewNote({ searchParams }: PageProps<"/me/notes/new">) {
  const sp = await searchParams;
  return <MineSection kind="notes" open detail={<NewDoc mode={sp.mode === "link" ? "link" : "note"} group={typeof sp.group === "string" ? sp.group : null} />} />;
}
