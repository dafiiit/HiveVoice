import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { initiativeCardColumns, initiativeCardFrom, type InitiativeCard as Card } from "@/lib/queries";
import { InitiativeCard } from "@/components/InitiativeCard";
import { Logo } from "@/components/ui/Logo";
import { SmartHeader } from "@/components/shell/SmartHeader";
import { Lead } from "@/components/ui/Lead";
import { btn } from "@/components/ui/styles";
import { LanguageMenu } from "@/components/LanguageMenu";
import { InstallApp } from "@/components/InstallApp";
import { desktopRelease } from "@/lib/desktopRelease";

type Pair = { need: string; offer: string };

export default async function Welcome() {
  const session = await getSession();
  if (session) redirect(session.profile.onboarded ? "/friends" : "/onboarding");
  const t = await getTranslations("welcome");
  const tp = await getTranslations("principles");
  const tr = await getTranslations("rights");
  const ttr = await getTranslations("modrights.transparency");
  const ttg = await getTranslations("growth");

  const [live, pairs] = await asViewer(null, async (tx) => [
    await tx<Card[]>`
      select ${initiativeCardColumns(tx)} from ${initiativeCardFrom(tx)}
      where i.published_at is not null and i.outcome is null and i.blocked_at is null
      order by (i.phase in ('debate', 'addressee', 'implementation')) desc, i.support_count desc limit 3`,
    await tx<Pair[]>`
      select n.title as need, o.title as offer
      from public.listings n
      join lateral (
        select o.id, o.title, o.owner_id from public.listings o
        join public.listing_tags ot on ot.listing_id = o.id
        join public.listing_tags nt on nt.tag_id = ot.tag_id and nt.listing_id = n.id
        where o.kind = 'offer' and o.status = 'active' limit 1) o on true
      where n.kind = 'need' and n.status = 'active'
      order by n.created_at desc limit 3`,
  ] as const);

  const stages = [
    { n: "01", image: "anfragen", key: "need" },
    { n: "02", image: "anbieten", key: "offer" },
    { n: "03", image: "verbinden", key: "connect" },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col">
      <SmartHeader className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 md:px-10">
        <Logo size={40} />
        <div className="flex items-center gap-2">
          <Link href="/principles" className="hidden h-11 items-center px-2 font-bold text-ink no-underline sm:inline-flex md:px-4">{tp("nav")}</Link>
          <LanguageMenu />
          <Link href="/community" className="hidden h-11 items-center px-4 font-bold text-ink no-underline md:inline-flex">{t("guest")}</Link>
          <Link href="/login" className={btn.primary}>{t("login")}</Link>
        </div>
      </SmartHeader>

      <section className="flex flex-wrap items-end gap-6 border-b border-line px-4 pb-8 pt-6 sm:px-6 md:px-10 md:pb-[104px] md:pt-24">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <h1 className="display-xl m-0 max-w-[1000px]">{t("hero1")}<br /><span className="text-red">{t("hero2")}</span></h1>
          <div className="relative flex flex-col gap-6 md:pl-[25%]">
            <Lead long={t("lead")} short={t("leadShort")} className="max-w-[560px] text-xl" />
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className={btn.primary}>{t("join")}</Link>
              <Link href="/community" className={btn.secondary}>{t("guest")}</Link>
            </div>
          </div>
        </div>
      </section>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/welcome/hero.jpg" alt={t("heroAlt")} width={1584} height={672} fetchPriority="high"
        className="aspect-[1584/672] min-h-[220px] w-full border-b border-line object-cover" />

      {live.length > 0 && (
        <section className="flex flex-col gap-6 border-b border-line px-4 py-6 sm:px-6 md:px-10 md:py-[72px]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="m-0 text-2xl font-bold">{t("moving")}</h2>
            <Link href="/community" className="font-bold text-ink">{t("allInitiatives")}</Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {live.map((it) => <InitiativeCard key={it.id} it={it} />)}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-6 border-b border-line px-4 py-6 sm:px-6 md:px-10 md:py-[72px]">
        <h2 className="m-0 text-2xl font-bold">{t("stagesTitle")}</h2>
        <ol className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
          {stages.map((s) => (
            <li key={s.n} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/images/welcome/${s.image}.jpg`} alt="" width={900} height={603} loading="lazy" className="aspect-[3/2] w-full object-cover" />
              <span className="tabular mt-2 border-t-[6px] border-ink pt-3 text-[13px] font-bold">{s.n}</span>
              <strong className="text-xl leading-tight">{t(`stage.${s.key}.name`)}</strong>
              <span>{t(`stage.${s.key}.text`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap gap-10 border-b border-line bg-surface px-4 py-6 sm:px-6 md:px-10 md:py-[72px]">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <h2 className="m-0 text-[clamp(32px,3.4vw,48px)] font-bold leading-none tracking-[-0.03em]">{t("offerTitle")}</h2>
          <Link href="/me/listings?as=offer" className={`${btn.primary} self-start`}>{t("offerCta")}</Link>
        </div>
        {pairs.length > 0 && (
          <div className="flex min-w-0 flex-[2_1_520px] flex-col border-t-[6px] border-ink">
            {pairs.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-4">
                <strong className="min-w-0 flex-[1_1_200px]">#{t("needs")} {p.need}</strong>
                <span aria-hidden="true" className="h-0.5 w-10 flex-none bg-ink" />
                <strong className="min-w-0 flex-[1_1_200px]">#{t("offers")} {p.offer}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 border-b border-line px-4 py-6 sm:px-6 md:grid-cols-3 md:gap-5 md:px-10 md:py-[72px]">
        {(["bots", "secret", "life"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-3">
            <h3 className="m-0 text-2xl font-bold">{t(`trust.${k}.title`)}</h3>
            <p className="m-0">{t(`trust.${k}.text`)}</p>
          </div>
        ))}
      </section>

      <InstallApp release={await desktopRelease()} />

      <footer className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-6 pt-4 text-sm sm:px-6 md:px-10 md:pb-10 md:pt-6">
        <strong>HiveVoice</strong>
        <span>{t("nonpartisan")}</span>
        <Link href="/principles">{tp("nav")}</Link>
        <Link href="/rights">{tr("title")}</Link>
        <Link href="/sharing">{ttg("title")}</Link>
        <Link href="/transparency">{ttr("title")}</Link>
        <Link href="/legal/imprint">{t("imprint")}</Link>
        <Link href="/legal/privacy">{t("privacy")}</Link>
        <a href="https://github.com/dafiiit/HiveVoice">{t("source")}</a>
      </footer>
    </div>
  );
}
