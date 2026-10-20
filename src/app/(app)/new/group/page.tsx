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

export default async function NewGroup({ searchParams }: PageProps<"/new/group">) {
  const sp = await searchParams;
  const session = await requireSession("/new/group");
  const t = await getTranslations("group.form");
  const tn = await getTranslations("new.purpose");
  // From a private chat ("Gruppe mit … anlegen"): the other person is invited, the small private preset is chosen.
  const withId = typeof sp.with === "string" && /^[0-9a-f-]{36}$/.test(sp.with) ? sp.with : null;
  const { chain, ideas, invite } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({
    chain: await newChain(tx, session.profile.id), ideas: await popularTags(tx),
    invite: withId ? (await tx<{ id: string; name: string }[]>`select id, display_name as name from public.profiles where id = ${withId}`)[0] ?? null : null,
  }));
  const preset = typeof sp.preset === "string" ? sp.preset : invite ? "couple" : undefined;
  return (
    <Page width="narrow">
      <PageHeader title={t("title")} lead={t("lead")}>
        <Link href="/new/initiative" className="self-start text-sm text-ink underline">{tn("toInitiative")}</Link>
      </PageHeader>
      <GroupForm chain={chain} ideas={ideas} start={preset} invite={invite ?? undefined} />
    </Page>
  );
}
