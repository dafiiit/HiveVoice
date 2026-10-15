import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { Onboarding } from "@/components/onboarding/Onboarding";

export async function generateMetadata() {
  return { title: (await getTranslations("onboarding"))("title") };
}

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.onboarded) redirect("/connect");
  const tags = await asViewer(null, (tx) => popularTags(tx));
  return (
    <Onboarding
      alias={session.profile.alias ?? ""}
      realName={session.profile.real_name ?? ""}
      suggestions={tags}
    />
  );
}
