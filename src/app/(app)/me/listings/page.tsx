import { getTranslations } from "next-intl/server";
import { MarketPage } from "@/components/listings/MarketPage";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await getTranslations("market"))("mineTitle") };
}

export default async function MyListingsPage({ searchParams }: PageProps<"/me/listings">) {
  await requireSession("/me/listings");
  return <MarketPage searchParams={await searchParams} scope="me" />;
}
