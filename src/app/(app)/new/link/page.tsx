import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { ShareLinkForm } from "@/components/links/ShareLinkForm";

export async function generateMetadata() {
  return { title: (await getTranslations("links"))("shareTitle") };
}

export default async function NewLink({ searchParams }: PageProps<"/new/link">) {
  const sp = await searchParams;
  const session = await requireSession("/new/link");
  const t = await getTranslations("links");
  const { groups, ideas } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({
    groups: await tx<{ id: string; slug: string; name: string }[]>`
      select g.id, g.slug::text, g.name from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${session.profile.id} and g.archived_at is null and app.has_group_permission(g.id, 'post') order by g.name`,
    ideas: await popularTags(tx),
  }));
  return (
    <div className="flex flex-col gap-8 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0">{t("shareTitle")}</h1>
        <p className="m-0 max-w-[680px]">{t("shareLead")}</p>
      </div>
      <ShareLinkForm groups={groups} initialGroup={typeof sp.group === "string" ? sp.group : null} ideas={ideas} />
    </div>
  );
}
