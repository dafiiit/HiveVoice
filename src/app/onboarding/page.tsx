import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { Onboarding } from "@/components/onboarding/Onboarding";

export async function generateMetadata() {
  return { title: (await getTranslations("onboarding"))("title") };
}

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.onboarded) redirect("/connect");
  const tags = await asViewer(null, (tx) => tx<{ slug: string; n: number }[]>`
    select t.slug::text, count(*)::int n from public.tags t
    left join public.listing_tags lt on lt.tag_id = t.id
    left join public.user_interests ui on ui.tag_id = t.id
    group by t.slug order by n desc, t.slug limit 24`);
  return (
    <Onboarding
      alias={session.profile.alias ?? ""}
      realName={session.profile.real_name ?? ""}
      suggestions={tags.map((t) => t.slug)}
    />
  );
}
