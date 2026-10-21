import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";

export async function generateMetadata() {
  return { title: (await getTranslations("mine.filters"))("projects") };
}

export default async function MineInitiatives() {
  return <MineSection kind="projects" open={false} />;
}
