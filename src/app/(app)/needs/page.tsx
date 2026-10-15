import { getTranslations } from "next-intl/server";
import { MarketPage } from "@/components/listings/MarketPage";

export async function generateMetadata() {
  return { title: (await getTranslations("market"))("needTitle") };
}

export default async function Needs({ searchParams }: PageProps<"/needs">) {
  return <MarketPage kind="need" searchParams={await searchParams} />;
}
