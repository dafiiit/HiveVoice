import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { MarketPage } from "@/components/listings/MarketPage";

export async function generateMetadata() {
  return { title: (await getTranslations("market"))("newTitle") };
}

export default async function NewListing({ searchParams }: PageProps<"/me/listings/new">) {
  return <MineSection kind="listings" open detail={<MarketPage searchParams={await searchParams} scope="new" />} />;
}
