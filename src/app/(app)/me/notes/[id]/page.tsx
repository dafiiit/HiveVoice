import { MineSection } from "@/components/mine/MineSection";
import { LinkView } from "@/app/(app)/links/[id]/page";

export { generateMetadata } from "@/app/(app)/links/[id]/page";

export default async function MineNote({ params, searchParams }: PageProps<"/me/notes/[id]">) {
  const { id } = await params;
  return <MineSection kind="notes" selected={id} open detail={<LinkView id={id} sp={await searchParams} base={`/me/notes/${id}`} embedded />} />;
}
