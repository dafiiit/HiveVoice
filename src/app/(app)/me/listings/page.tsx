import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { MarketPage } from "@/components/listings/MarketPage";

export async function generateMetadata() {
  return { title: (await getTranslations("market"))("mineTitle") };
}

/** My listings; before one is opened, the right side shows what fits them. Old links with ?as= open the form. */
export default async function MyListingsPage({ searchParams }: PageProps<"/me/listings">) {
  const sp = await searchParams;
  if (typeof sp.as === "string" || typeof sp.title === "string") return <MineSection kind="listings" open detail={<MarketPage searchParams={sp} scope="new" />} />;
  return <MineSection kind="listings" open={false} detail={<MarketPage searchParams={sp} scope="matches" />} />;
}
