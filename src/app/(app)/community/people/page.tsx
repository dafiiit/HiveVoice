import { getTranslations } from "next-intl/server";
import { DirectorySection } from "@/components/community/DirectorySection";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("people") };
}

export default async function CommunityPeople({ searchParams }: PageProps<"/community/people">) {
  return <DirectorySection area="people" sp={await searchParams} />;
}
