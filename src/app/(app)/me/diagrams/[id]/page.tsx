import { MineSection } from "@/components/mine/MineSection";
import { LinkView } from "@/app/(app)/links/[id]/page";

export { generateMetadata } from "@/app/(app)/links/[id]/page";

export default async function MineDiagram({ params, searchParams }: PageProps<"/me/diagrams/[id]">) {
  const { id } = await params;
  return <MineSection kind="diagrams" selected={id} open detail={<LinkView id={id} sp={await searchParams} base={`/me/diagrams/${id}`} embedded />} />;
}
