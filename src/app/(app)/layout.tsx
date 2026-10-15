import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { getSession } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (session && !session.profile.onboarded) redirect("/onboarding");
  return <Shell session={session}>{children}</Shell>;
}
