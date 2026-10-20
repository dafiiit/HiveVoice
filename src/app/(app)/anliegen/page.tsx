import { getTranslations } from "next-intl/server";
import { MarketPage } from "@/components/listings/MarketPage";

export async function generateMetadata() {
  return { title: (await getTranslations("market"))("title") };
}

export default async function Anliegen({ searchParams }: PageProps<"/anliegen">) {
  return <MarketPage searchParams={await searchParams} />;
}
