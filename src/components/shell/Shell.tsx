import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import type { Session } from "@/lib/session";
import { Logo, LogoMark } from "../ui/Logo";
import { Avatar } from "../ui/Avatar";
import { IconInbox, IconPlus, IconSearch, IconSquare } from "../ui/Icons";
import { BottomNav, SideLinks, type NavItem } from "./NavLinks";
import { btn } from "../ui/styles";

type MyGroup = { slug: string; name: string };

export async function Shell({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const tl = await getTranslations("levels");
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const [groups, pending] = session
    ? await asViewer(viewer, async (tx) => [
        await tx<MyGroup[]>`
          select g.slug, g.name from public.group_members m join public.groups g on g.id = m.group_id
          where m.profile_id = ${session.profile.id} and g.archived_at is null order by m.joined_at desc limit 6`,
        Number((await tx`select count(*)::int n from public.contact_requests where to_profile_id = ${session.profile.id} and status = 'pending'`)[0].n),
      ] as const)
    : [[] as MyGroup[], 0];

  const items: NavItem[] = [
    { href: "/explore", label: t("explore") },
    { href: "/needs", label: t("needs") },
    { href: "/offers", label: t("offers"), badge: pending },
    { href: "/connect", label: t("connect") },
    { href: "/me", label: t("me") },
  ];
  const mobileItems = [items[1], items[2], items[3], items[4]];
  const place = session?.profile.home_region;

  return (
    <div className="flex min-h-dvh">
      <nav aria-label={t("main")} className="sticky top-0 hidden h-dvh w-60 flex-none flex-col gap-8 overflow-y-auto border-r border-line bg-paper px-6 pb-10 pt-8 md:flex">
        <Link href={session ? "/connect" : "/"} aria-label="HiveVoice" className="flex flex-col items-center gap-1.5 pb-2 pt-1 text-ink no-underline">
          <LogoMark size={96} />
          <span className="text-[30px] leading-none tracking-[-0.04em]"><span className="font-bold">hive</span>voice</span>
        </Link>
        <Link href="/new" className="flex h-12 items-center gap-2.5 bg-ink px-4 font-bold text-on-ink no-underline">
          <IconPlus /> {t("new")}
        </Link>
        <SideLinks items={items} />
        {groups.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="pb-2 text-[13px] font-bold">{t("yourGroups")}</span>
            {groups.map((g) => (
              <Link key={g.slug} href={`/groups/${g.slug}`} className="flex min-h-10 items-center gap-2.5 text-sm text-ink no-underline">
                <Avatar name={g.name} size={28} group />
                <span className="min-w-0 flex-1">{g.name}</span>
              </Link>
            ))}
          </div>
        )}
        <Link href="/responsible" className="text-sm text-muted">{t("responsible")}</Link>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="flex flex-col gap-3 border-b border-line px-6 py-4 md:h-[72px] md:flex-row md:items-center md:gap-3 md:px-10 md:py-0">
          <div className="flex items-center gap-2 md:contents">
            <Link href={session ? "/connect" : "/"} className="flex flex-1 items-center text-ink no-underline md:hidden" aria-label="HiveVoice">
              <Logo size={36} />
            </Link>
            <form action="/explore" role="search" className="hidden h-11 max-w-[520px] flex-1 items-center gap-2.5 border border-line bg-surface px-3.5 md:flex">
              <IconSearch />
              <label className="sr-only" htmlFor="top-search">{t("search")}</label>
              <input id="top-search" name="q" type="search" placeholder={t("searchPlaceholder")}
                className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-offset-2" />
            </form>
            <Link href="/explore" aria-label={t("explore")} className="inline-flex h-11 w-11 items-center justify-center border border-line-strong text-ink md:hidden">
              <IconSearch />
            </Link>
            {place && (
              <Link href="/me?tab=settings" className="hidden h-11 items-center gap-2 whitespace-nowrap border border-line-strong px-3.5 text-sm text-ink no-underline lg:inline-flex">
                <IconSquare /> <strong>{place.name}</strong>&nbsp;· {tl(place.level as "municipality")}
              </Link>
            )}
            <span className="hidden flex-1 md:block" />
            {session ? (
              <>
                <Link href="/notifications" aria-label={t("inbox", { n: session.profile.unread })}
                  className="relative inline-flex h-11 w-11 items-center justify-center border border-line text-ink">
                  <IconInbox />
                  {session.profile.unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center bg-red px-1 text-[11px] font-bold text-on-red">
                      {session.profile.unread}
                    </span>
                  )}
                </Link>
                <Link href="/me" aria-label={t("profileOf", { name: session.profile.display_name })} className="inline-flex">
                  <Avatar name={session.profile.display_name} seed={session.profile.avatar_seed} size={44} />
                </Link>
              </>
            ) : (
              <Link href="/login" className={btn.primary}>{t("login")}</Link>
            )}
          </div>
          {place && (
            <Link href="/me?tab=settings" className="inline-flex h-8 items-center gap-2 self-start text-sm text-muted no-underline md:hidden">
              <IconSquare size={12} /> <strong className="text-ink">{place.name}</strong>&nbsp;· {tl(place.level as "municipality")}
            </Link>
          )}
        </header>
        <main id="main" className="flex-1">{children}</main>
      </div>
      <BottomNav items={mobileItems} newLabel={t("new")} />
    </div>
  );
}
