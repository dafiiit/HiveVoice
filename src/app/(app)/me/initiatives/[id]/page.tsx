import { MineSection } from "@/components/mine/MineSection";
import { InitiativeView } from "@/app/(app)/initiatives/[id]/page";

export { generateMetadata } from "@/app/(app)/initiatives/[id]/page";

export default async function MineInitiative({ params, searchParams }: PageProps<"/me/initiatives/[id]">) {
  const { id } = await params;
  return <MineSection kind="projects" selected={id} open detail={<InitiativeView id={id} sp={await searchParams} base={`/me/initiatives/${id}`} embedded />} />;
}
