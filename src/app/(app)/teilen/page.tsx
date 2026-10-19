import Link from "next/link";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { relTime } from "@/lib/format";
import { ShareButtons } from "@/components/ShareButtons";
import { InviteCodes, RedeemCode, type CodeRow } from "@/components/growth/InviteCodes";

export async function generateMetadata() {
  return { title: (await getTranslations("growth"))("title") };
}

type Gap = { tag: string; n: number };

/** Pass the app on, invite people, and see where in the place somebody is still missing. */
export default async function SharePage() {
  const t = await getTranslations("growth");
  const locale = await getLocale();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const d = await asViewer(viewer, async (tx) => {
    const [{ mode }] = await tx<{ mode: string }[]>`select app.registration_mode() as mode`;
    if (!viewer) return { mode, codes: [] as CodeRow[], left: 0, redeemed: true, invitees: [] as { name: string; since: string }[], gaps: [] as Gap[], days: 30 };
    const codes = await tx<CodeRow[]>`
      select code, used_by is not null as used, expires_at, revoked_at is not null as revoked from public.invite_codes
      where owner_id = ${viewer.profileId} and revoked_at is null order by created_at desc limit 30`;
    const [{ left }] = await tx<{ left: number }[]>`select app.invites_left() as left`;
    const [{ redeemed }] = await tx<{ redeemed: boolean }[]>`select app.invite_redeemed() as redeemed`;
    const [{ inv }] = await tx<{ inv: { name: string; since: string }[] }[]>`select app.my_invitees() as inv`;
    const home = session!.profile.home_region_id;
    const gaps = home ? (await tx<{ g: Gap[] }[]>`select app.gaps(${home}) as g`)[0].g : [];
    const [{ days }] = await tx<{ days: number }[]>`select app.param('invite_voucher_days') as days`;
    return { mode, codes, left, redeemed, invitees: inv, gaps, days };
  });
  return (
    <div className="flex max-w-[860px] flex-col gap-8 px-4 pb-8 pt-4 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0">{t("title")}</h1>
        <p className="m-0 max-w-[720px] text-lg">{t("lead")}</p>
      </div>

      <section className="flex flex-col gap-3 border border-ink border-t-[6px] bg-surface p-4 md:p-6">
        <h2 className="m-0 text-2xl font-bold">{t("share.app")}</h2>
        <ShareButtons url={origin} title="HiveVoice" text={t("share.appText")} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("invite.title")}</h2>
        <p className="m-0">{t(`invite.mode_${d.mode === "invite" ? "invite" : "open"}`)}</p>
        {!session && <Link href="/login?next=/teilen" className="font-bold">{t("page.signIn")}</Link>}
        {session && !d.redeemed && (
          <div className="flex flex-col gap-2"><p role="status" className="m-0 border-l-4 border-red pl-3 font-bold">{t("invite.needCode")}</p><RedeemCode /></div>
        )}
        {session && d.redeemed && <InviteCodes codes={d.codes} left={d.left} origin={origin} />}
        {d.invitees.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <strong>{t("invite.voucher", { days: d.days })}</strong>
            {d.invitees.map((i) => <span key={i.name + i.since}>{i.name} · {relTime(i.since, locale)}</span>)}
            <span className="text-muted">{t("invite.voucherText")}</span>
          </div>
        )}
      </section>

      {session && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-2xl font-bold">{t("gaps.title")}</h2>
          {session.profile.home_region && <p className="m-0 text-sm text-muted">{t("gaps.place", { name: session.profile.home_region.name })}</p>}
          {d.gaps.length === 0 ? <p className="m-0">{t("gaps.none")}</p> : (
            <>
              <p className="m-0">{t("gaps.text")}</p>
              {d.gaps.map((g) => (
                <div key={g.tag} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2">
                  <span><strong>#{g.tag}</strong> · <span className="text-sm text-muted">{t("gaps.n", { n: g.n })}</span></span>
                  <Link href={`/me?tab=resp`} className="text-sm font-bold">{t("gaps.responsibility")}</Link>
                </div>
              ))}
              <ShareButtons url={origin} title="HiveVoice" text={`${t("gaps.invite")}: ${t("share.appText")}`} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
