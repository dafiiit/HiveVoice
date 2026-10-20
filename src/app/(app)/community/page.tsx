import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/ui/Page";
import { Pinboard } from "@/components/community/Pinboard";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("board") };
}

export default async function Board({ searchParams }: PageProps<"/community">) {
  const t = await getTranslations("community");
  return (
    <Page>
      <PageHeader title={t("nav.board")} lead={t("board.lead")} mobileHidden />
      <Pinboard sp={await searchParams} />
    </Page>
  );
}
