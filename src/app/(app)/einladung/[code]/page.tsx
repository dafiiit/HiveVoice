import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { asViewer } from "@/lib/db";
import { RedeemCode } from "@/components/growth/InviteCodes";
import { btn } from "@/components/ui/styles";

export async function generateMetadata() {
  return { title: (await getTranslations("growth.page"))("title"), robots: { index: false, follow: false } };
}

/** What somebody sees who follows an invitation link. The code is not shown to others and never indexed. */
export default async function InvitePage({ params }: PageProps<"/einladung/[code]">) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 10);
  const t = await getTranslations("growth.page");
  const session = await getSession();
  const redeemed = session
    ? (await asViewer({ authId: session.authId, profileId: session.profile.id }, (tx) => tx<{ r: boolean }[]>`select app.invite_redeemed() as r`))[0]?.r
    : false;
  return (
    <div className="flex max-w-[640px] flex-col gap-5 px-4 pb-8 pt-8 md:px-10 md:pt-16">
      <h1 className="display m-0">{t("title")}</h1>
      <p className="m-0 text-lg">{t("text")}</p>
      {!session && <Link href={`/login?next=${encodeURIComponent(`/einladung/${clean}`)}`} className={`${btn.primaryLg} self-start`}>{t("signIn")}</Link>}
      {session && redeemed && <p role="status" className="m-0 font-bold">{t("done")}</p>}
      {session && !redeemed && <RedeemCode initial={clean} />}
    </div>
  );
}
