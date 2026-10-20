import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/ui/Page";
import { Directory } from "@/components/community/Directory";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("people") };
}

export default async function CommunityPeople({ searchParams }: PageProps<"/community/people">) {
  const t = await getTranslations("community");
  return (
    <Page>
      <PageHeader title={t("nav.people")} lead={t("people.lead")} mobileHidden />
      <Directory sp={await searchParams} area="people" />
    </Page>
  );
}
