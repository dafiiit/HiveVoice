import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AcceptInvite } from "@/components/group/AcceptInvite";
import { btn } from "@/components/ui/styles";

type Preview = { valid: boolean; reason?: string; name?: string; slug?: string; role?: string; summary?: string | null; members?: number | null; adults_only?: boolean };

export async function generateMetadata() {
  return { title: (await getTranslations("grouprights.join_page"))("title"), robots: { index: false } };
}

/** An invitation link. Before signing in it names the group and nothing else when the group is secret. */
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const t = await getTranslations("grouprights.join_page");
  const tr = await getTranslations("grouprights");
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const preview = /^[0-9a-f]{32}$/.test(code)
    ? await asViewer(viewer, async (tx) => (await tx<{ p: Preview }[]>`select app.invite_preview(${code}) as p`)[0].p)
    : ({ valid: false, reason: "not_found" } as Preview);
  return (
    <div className="flex max-w-[640px] flex-col gap-6 px-4 pb-8 pt-4 md:px-10 md:pb-20 md:pt-16">
      <h1 className="display m-0">{t("title")}</h1>
      {!preview.valid ? (
        <>
          <p role="alert" className="m-0 border-l-4 border-red pl-3 text-lg font-bold">{t((preview.reason ?? "invalid") as "invalid")}</p>
          <Link href="/connect" className="font-bold">{t("go")}</Link>
        </>
      ) : (
        <>
          <p className="m-0 text-xl">{t("text", { name: preview.name ?? "" })}</p>
          {session && (
            <div className="flex flex-col gap-1">
              {preview.summary && <p className="m-0">{preview.summary}</p>}
              <span className="text-sm text-muted">{[preview.members != null ? t("members", { n: preview.members }) : null, preview.adults_only ? t("adults") : null, t("role", { role: tr(`roles.${preview.role ?? "contributor"}` as "roles.admin") })].filter(Boolean).join(" · ")}</span>
            </div>
          )}
          {session ? <AcceptInvite code={code} /> : <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className={`${btn.primaryLg} self-start`}>{t("signIn")}</Link>}
        </>
      )}
    </div>
  );
}
