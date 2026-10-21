import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { NewDoc } from "@/components/mine/NewDoc";

export async function generateMetadata() {
  return { title: (await getTranslations("mine"))("uploadTitle") };
}

export default async function NewUpload({ searchParams }: PageProps<"/me/uploads/new">) {
  const sp = await searchParams;
  return <MineSection kind="uploads" open detail={<NewDoc mode={sp.mode === "link" ? "link" : "file"} group={typeof sp.group === "string" ? sp.group : null} />} />;
}
