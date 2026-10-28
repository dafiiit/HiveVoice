import { MineSection } from "@/components/mine/MineSection";
import { LinkView } from "@/app/(app)/links/[id]/page";

export { generateMetadata } from "@/app/(app)/links/[id]/page";

export default async function MineNote({ params, searchParams }: PageProps<"/me/notes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  return <MineSection kind="notes" selected={id} open tasksOnly={sp.f === "tasks"} detail={<LinkView id={id} sp={sp} base={`/me/notes/${id}`} embedded />} />;
}
