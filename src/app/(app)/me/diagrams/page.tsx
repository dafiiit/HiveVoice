import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { MyDocsSide } from "@/components/mine/MyDocsSide";

export async function generateMetadata() {
  return { title: (await getTranslations("mine.filters"))("diagrams") };
}

/** Before one is opened: hand-overs, what others shared with me, the trash. */
export default async function MineDiagrams({ searchParams }: PageProps<"/me/diagrams">) {
  const more = (await searchParams).more === "1";
  return <MineSection kind="diagrams" open={false} auto={!more} detail={<MyDocsSide kind="diagrams" />} />;
}
