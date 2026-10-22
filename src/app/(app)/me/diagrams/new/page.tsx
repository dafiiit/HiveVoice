import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { DiagramEditor } from "@/components/links/DiagramEditor";

export async function generateMetadata() {
  return { title: (await getTranslations("diagrams"))("newTitle") };
}

export default async function NewDiagram() {
  return <MineSection kind="diagrams" open detail={<DiagramEditor title="" svg="" base="/me/diagrams" />} />;
}
