import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { InitiativeWizard } from "@/components/new/InitiativeWizard";
import { Page, PageHeader } from "@/components/ui/Page";
import { newChain } from "@/components/new/chain";

export async function generateMetadata() {
  return { title: (await getTranslations("new.initiative"))("pageTitle") };
}

export default async function NewInitiative() {
  const session = await requireSession("/new/initiative");
  const t = await getTranslations("new.initiative");
  const tn = await getTranslations("new.purpose");
  const { chain, ideas } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({ chain: await newChain(tx, session.profile.id), ideas: await popularTags(tx) }));
  return (
    <Page>
      <PageHeader title={t("pageTitle")} lead={t("pageLead")}>
        <Link href="/new/group" className="self-start text-sm text-ink underline">{tn("toGroup")}</Link>
      </PageHeader>
      <InitiativeWizard chain={chain} ideas={ideas} />
    </Page>
  );
}
