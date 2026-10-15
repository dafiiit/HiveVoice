import { getTranslations } from "next-intl/server";
import { MarketPage } from "@/components/listings/MarketPage";

export async function generateMetadata() {
  return { title: (await getTranslations("market"))("offerTitle") };
}

export default async function Offers({ searchParams }: PageProps<"/offers">) {
  return <MarketPage kind="offer" searchParams={await searchParams} />;
}
