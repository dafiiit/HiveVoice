import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { ShareKnowledge } from "@/components/links/ShareKnowledge";
import { Page, PageHeader } from "@/components/ui/Page";

/** A new note (Markdown) or a new upload (file or link), on the right side of Ich. */
export async function NewDoc({ mode, group, list = false }: { mode: "note" | "file" | "link"; group: string | null; list?: boolean }) {
  const session = await requireSession(mode === "note" ? "/me/notes/new" : "/me/uploads/new");
  const tm = await getTranslations("mine");
  const { groups, ideas } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({
    groups: await tx<{ id: string; slug: string; name: string }[]>`
      select g.id, g.slug::text, g.name from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${session.profile.id} and g.archived_at is null and app.has_group_permission(g.id, 'post') order by g.name`,
    ideas: await popularTags(tx),
  }));
  return (
    <Page width="narrow">
      {mode !== "note" && <PageHeader title={tm("uploadTitle")} />}
      <ShareKnowledge groups={groups} initialGroup={group} ideas={ideas} initialMode={mode} startList={list} />
    </Page>
  );
}
