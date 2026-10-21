import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { MyDocsSide } from "@/components/mine/MyDocsSide";

export async function generateMetadata() {
  return { title: (await getTranslations("mine.filters"))("uploads") };
}

/** Before one is opened: hand-overs, what others shared with me, the trash and the storage used. */
export default async function MineUploads() {
  return <MineSection kind="uploads" open={false} detail={<MyDocsSide kind="uploads" />} />;
}
