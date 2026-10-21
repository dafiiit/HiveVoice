import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { getSession } from "@/lib/session";
import { asViewer } from "@/lib/db";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (session && !session.profile.onboarded) redirect("/onboarding");
  // The examples (one chat, one group, one request, own offer and wanted post …): made once per account, the first time.
  if (session) await asViewer({ authId: session.authId, profileId: session.profile.id }, (tx) => tx`select app.ensure_demo()`).catch(() => null);
  return <Shell session={session}>{children}</Shell>;
}
