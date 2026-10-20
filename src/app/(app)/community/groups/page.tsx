import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/ui/Page";
import { Directory } from "@/components/community/Directory";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("groups") };
}

export default async function CommunityGroups({ searchParams }: PageProps<"/community/groups">) {
  const t = await getTranslations("community");
  return (
    <Page>
      <PageHeader title={t("nav.groups")} lead={t("groups.lead")} mobileHidden />
      <Directory sp={await searchParams} area="groups" />
    </Page>
  );
}
