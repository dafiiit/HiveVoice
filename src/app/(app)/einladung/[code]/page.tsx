import { getTranslations } from "next-intl/server";
import { AppInvite, GroupInvite, isGroupCode } from "@/components/invite/Invite";

export async function generateMetadata({ params }: PageProps<"/einladung/[code]">) {
  const group = isGroupCode((await params).code);
  return { title: (await getTranslations(group ? "grouprights.join_page" : "growth.page"))("title"), robots: { index: false, follow: false } };
}

/** One address for every invitation link, into a group or into HiveVoice. The code is never shown to others or indexed. */
export default async function InvitePage({ params }: PageProps<"/einladung/[code]">) {
  const { code } = await params;
  return isGroupCode(code) ? <GroupInvite code={code} /> : <AppInvite code={code} />;
}
