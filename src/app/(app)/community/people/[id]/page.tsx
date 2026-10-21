import { DirectorySection } from "@/components/community/DirectorySection";
import { ProfileView } from "@/app/(app)/profile/[id]/page";

export default async function CommunityPerson({ params, searchParams }: PageProps<"/community/people/[id]">) {
  const { id } = await params;
  return <DirectorySection area="people" sp={await searchParams} selected={id} detail={<ProfileView id={id} embedded />} />;
}
