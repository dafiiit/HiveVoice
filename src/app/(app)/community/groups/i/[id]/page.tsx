import { DirectorySection } from "@/components/community/DirectorySection";
import { InitiativeView } from "@/app/(app)/initiatives/[id]/page";

export { generateMetadata } from "@/app/(app)/initiatives/[id]/page";

export default async function CommunityInitiative({ params, searchParams }: PageProps<"/community/groups/i/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  return <DirectorySection area="groups" sp={{ ...sp, kind: "initiatives" }} selected={id} detail={<InitiativeView id={id} sp={sp} base={`/community/groups/i/${id}`} embedded />} />;
}
