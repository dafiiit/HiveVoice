import { getTranslations } from "next-intl/server";
import { ListingsSection } from "@/components/community/ListingsSection";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("listings") };
}

export default async function CommunityListings({ searchParams }: PageProps<"/community/listings">) {
  return <ListingsSection sp={await searchParams} />;
}
