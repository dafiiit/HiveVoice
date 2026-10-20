import { getTranslations } from "next-intl/server";
import { MarketPage } from "@/components/listings/MarketPage";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("listings") };
}

export default async function CommunityListings({ searchParams }: PageProps<"/community/listings">) {
  return <MarketPage searchParams={await searchParams} scope="community" />;
}
