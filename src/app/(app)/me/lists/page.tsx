import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";

export async function generateMetadata() {
  return { title: (await getTranslations("mine.filters"))("lists") };
}

export default async function MineLists() {
  return <MineSection kind="lists" open={false} />;
}
