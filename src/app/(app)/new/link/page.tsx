import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { ShareKnowledge } from "@/components/links/ShareKnowledge";
import { Page, PageHeader } from "@/components/ui/Page";

export async function generateMetadata() {
  return { title: (await getTranslations("links"))("shareTitle") };
}

export default async function NewLink({ searchParams }: PageProps<"/new/link">) {
  const sp = await searchParams;
  const session = await requireSession("/new/link");
  const t = await getTranslations("links");
  const tm = await getTranslations("mine");
  const { groups, ideas } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({
    groups: await tx<{ id: string; slug: string; name: string }[]>`
      select g.id, g.slug::text, g.name from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${session.profile.id} and g.archived_at is null and app.has_group_permission(g.id, 'post') order by g.name`,
    ideas: await popularTags(tx),
  }));
  return (
    <Page width="narrow">
      <PageHeader title={sp.mode === "note" ? tm("newDocTitle") : t("shareTitle")} lead={t("shareLeadShort")} />
      <ShareKnowledge groups={groups} initialGroup={typeof sp.group === "string" ? sp.group : null} ideas={ideas} initialMode={sp.mode === "note" || sp.mode === "file" ? sp.mode : "link"} />
    </Page>
  );
}
