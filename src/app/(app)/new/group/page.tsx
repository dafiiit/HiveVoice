import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { GroupForm } from "@/components/new/GroupForm";
import { Page, PageHeader } from "@/components/ui/Page";
import { newChain } from "@/components/new/chain";

export async function generateMetadata() {
  return { title: (await getTranslations("group"))("form.title") };
}

export default async function NewGroup() {
  const session = await requireSession("/new/group");
  const t = await getTranslations("group.form");
  const tn = await getTranslations("new.purpose");
  const { chain, ideas } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({ chain: await newChain(tx, session.profile.id), ideas: await popularTags(tx) }));
  return (
    <Page width="narrow">
      <PageHeader title={t("title")} lead={t("lead")}>
        <Link href="/new/initiative" className="self-start text-sm text-ink underline">{tn("toInitiative")}</Link>
      </PageHeader>
      <GroupForm chain={chain} ideas={ideas} />
    </Page>
  );
}
