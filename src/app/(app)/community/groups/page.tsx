import { getTranslations } from "next-intl/server";
import { DirectorySection } from "@/components/community/DirectorySection";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("groups") };
}

export default async function CommunityGroups({ searchParams }: PageProps<"/community/groups">) {
  return <DirectorySection area="groups" sp={await searchParams} />;
}
