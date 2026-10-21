import { DirectorySection } from "@/components/community/DirectorySection";
import { GroupView } from "@/app/(app)/groups/[slug]/page";

export { generateMetadata } from "@/app/(app)/groups/[slug]/page";

export default async function CommunityGroup({ params, searchParams }: PageProps<"/community/groups/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  return <DirectorySection area="groups" sp={sp} selected={slug} detail={<GroupView slug={slug} sp={sp} base={`/community/groups/${slug}`} embedded />} />;
}
