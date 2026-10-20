import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import type { Session } from "@/lib/session";
import { Logo, LogoMark } from "../ui/Logo";
import { Avatar } from "../ui/Avatar";
import { IconInbox, IconPlus } from "../ui/Icons";
import { BottomNav, SideLinks, type NavItem } from "./NavLinks";
import { btn } from "../ui/styles";
import { LanguageMenu } from "../LanguageMenu";
import { QuickSearch } from "./QuickSearch";
import { PlaceMenu } from "./PlaceMenu";
import { getPlace } from "@/lib/place";

type MyGroup = { slug: string; name: string };

export async function Shell({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const tp = await getTranslations("principles");
  const tm = await getTranslations("mine");
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  // Verbinden carries what waits for an answer: unread chats, requests to me, people asking to join my groups.
  const [groups, waiting] = session
    ? await asViewer(viewer, async (tx) => [
        await tx<MyGroup[]>`
          select g.slug, g.name from public.group_members m join public.groups g on g.id = m.group_id
          where m.profile_id = ${session.profile.id} and g.archived_at is null order by m.joined_at desc limit 6`,
        Number((await tx`
          select (
            (select count(*) from public.conversation_participants cp where cp.profile_id = ${session.profile.id}
               and exists (select 1 from public.messages m where m.conversation_id = cp.conversation_id and m.sender_id <> ${session.profile.id} and m.created_at > cp.last_read_at))
            + (select count(*) from public.contact_requests r where r.to_profile_id = ${session.profile.id} and r.status = 'pending')
            + (select count(*) from public.group_join_requests j where j.status = 'pending' and j.profile_id <> ${session.profile.id} and app.has_group_permission(j.group_id, 'manage_members'))
          )::int as n`)[0].n),
      ] as const)
    : [[] as MyGroup[], 0];

  // "Für mich" lives in the avatar at the top right, so the side navigation stays short.
  const items: NavItem[] = [
    { href: "/explore", label: t("explore") },
    { href: "/anliegen", label: t("anliegen") },
    { href: "/connect", label: t("connect"), badge: waiting },
    ...(session ? [{ href: "/inhalte", label: tm("title"), short: tm("nav") }] : []),
  ];
  const place = await getPlace();

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
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper px-4 md:h-[72px] md:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:contents">
            <Link href={session ? "/connect" : "/"} className="flex flex-1 items-center text-ink no-underline md:hidden" aria-label="HiveVoice">
              <Logo size={36} compact={!session} />
            </Link>
            <div className="flex items-center gap-2 md:order-3 md:ml-auto">
              <Link href="/principles" className="inline-flex h-11 items-center px-1 text-sm font-bold text-ink no-underline sm:px-2 md:px-3">{tp("nav")}</Link>
              {session ? (
                <>
                  <Link href="/notifications" aria-label={t("inbox", { n: session.profile.unread })}
                    className="relative inline-flex h-11 w-11 flex-none items-center justify-center border border-line-strong bg-surface text-ink">
                    <IconInbox />
                    {session.profile.unread > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center bg-red px-1 text-[11px] font-bold text-on-red">
                        {session.profile.unread}
                      </span>
                    )}
                  </Link>
                  <Link href="/me" aria-label={t("profileOf", { name: session.profile.display_name })} className="inline-flex h-11 w-11 flex-none">
                    <Avatar name={session.profile.display_name} seed={session.profile.avatar_seed} path={session.profile.avatar_path} size={44} />
                  </Link>
                </>
              ) : (
                <>
                  <LanguageMenu />
                  <Link href="/login" className={btn.primary}>{t("login")}</Link>
                </>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-2 md:contents">
            <QuickSearch className="md:order-1" />
            <PlaceMenu className="md:order-2" signedIn={!!session} place={place ? { id: place.id, name: place.name, level: place.level, chain: place.chain } : null} />
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
      </div>
      <BottomNav items={items} newLabel={t("new")} />
    </div>
  );
}
