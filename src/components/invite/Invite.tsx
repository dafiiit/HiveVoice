import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AcceptInvite } from "@/components/group/AcceptInvite";
import { RedeemCode } from "@/components/growth/InviteCodes";
import { btn } from "@/components/ui/styles";
import { Notice, Page, PageHeader } from "@/components/ui/Page";

/** Group invitations are 32 hex characters, invitations to the app short codes of letters and digits. */
export const isGroupCode = (code: string) => /^[0-9a-f]{32}$/.test(code);

type Preview = { valid: boolean; reason?: string; name?: string; slug?: string; role?: string; summary?: string | null; members?: number | null; adults_only?: boolean };

/** An invitation into a group. Before signing in it names the group and nothing else when the group is secret. */
export async function GroupInvite({ code }: { code: string }) {
  const t = await getTranslations("grouprights.join_page");
  const tr = await getTranslations("grouprights");
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const preview = isGroupCode(code)
    ? await asViewer(viewer, async (tx) => (await tx<{ p: Preview }[]>`select app.invite_preview(${code}) as p`)[0].p)
    : ({ valid: false, reason: "not_found" } as Preview);
  return (
    <Page width="narrow">
      <PageHeader title={t("title")} />
      {!preview.valid ? (
        <>
          <Notice tone="error" className="text-lg">{t((preview.reason ?? "invalid") as "invalid")}</Notice>
          <Link href="/connect" className={`${btn.secondary} self-start`}>{t("go")}</Link>
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
          {session ? <AcceptInvite code={code} /> : <Link href={`/login?next=${encodeURIComponent(`/einladung/${code}`)}`} className={`${btn.primary} self-start`}>{t("signIn")}</Link>}
        </>
      )}
    </Page>
  );
}

/** An invitation to HiveVoice itself (a code that lets a new account start right away). */
export async function AppInvite({ code }: { code: string }) {
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 10);
  const t = await getTranslations("growth.page");
  const session = await getSession();
  const redeemed = session
    ? (await asViewer({ authId: session.authId, profileId: session.profile.id }, (tx) => tx<{ r: boolean }[]>`select app.invite_redeemed() as r`))[0]?.r
    : false;
  return (
    <Page width="narrow">
      <PageHeader title={t("title")} />
      <p className="m-0 text-lg">{t("text")}</p>
      {!session && <Link href={`/login?next=${encodeURIComponent(`/einladung/${clean}`)}`} className={`${btn.primary} self-start`}>{t("signIn")}</Link>}
      {session && redeemed && <Notice tone="status">{t("done")}</Notice>}
      {session && !redeemed && <RedeemCode initial={clean} />}
    </Page>
  );
}
