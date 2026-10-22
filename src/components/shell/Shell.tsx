import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import type { Session } from "@/lib/session";
import { Logo, LogoMark } from "../ui/Logo";
import { IconInbox } from "../ui/Icons";
import { BottomNav, type NavItem } from "./NavLinks";
import { Sidebar } from "./Sidebar";
import { cookies } from "next/headers";
import { btn } from "../ui/styles";
import { LanguageMenu } from "../LanguageMenu";
import { QuickSearch } from "./QuickSearch";
import { AccountMenu } from "./AccountMenu";
import { ActiveInView } from "./ActiveInView";
import { Suspense, type CSSProperties } from "react";
import { LIST_COOKIE, listWidth } from "./listWidth";

export async function Shell({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  // Freunde carries what waits for an answer: unread chats, requests to me, people asking to join my groups.
  const badges = session
    ? await asViewer(viewer, async (tx) => (await tx<{ chats: number; requests: number }[]>`
          select
            (select count(*) from public.conversation_participants cp where cp.profile_id = ${session.profile.id}
               and exists (select 1 from public.messages m where m.conversation_id = cp.conversation_id and m.sender_id <> ${session.profile.id} and m.created_at > cp.last_read_at))::int as chats,
            ((select count(*) from public.contact_requests r where r.to_profile_id = ${session.profile.id} and r.status = 'pending')
            + (select count(*) from public.group_join_requests j where j.status = 'pending' and j.profile_id <> ${session.profile.id} and app.has_group_permission(j.group_id, 'manage_members')))::int as requests`)[0])
    : { chats: 0, requests: 0 };
  const waiting = badges.chats + badges.requests;
  const jar = await cookies();
  const fold = jar.get("hv_sidebar")?.value;
  // The width of the list in the middle, as the person dragged it (ListResizer).
  const listW = listWidth(jar.get(LIST_COOKIE)?.value);

  // Three areas by closeness, like the rail in Teams: Gemeinschaft (everyone), Freunde (people and groups I know), Ich (my own things).
  const items: NavItem[] = [
    { area: "community", href: "/community", label: t("community") },
    { area: "friends", href: "/friends", label: t("friends"), badge: waiting },
    { area: "me", href: session ? "/me" : "/login?next=/me", label: t("me") },
  ];

  return (
    <div data-shell className="flex min-h-dvh flex-col" style={listW ? ({ "--list-w": `${listW}px` } as CSSProperties) : undefined}>
      <header className="sticky top-0 z-30 flex h-16 flex-none items-center gap-3 border-b border-line bg-paper px-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,600px)_minmax(0,1fr)] md:px-5">
        <Link href={session ? "/friends" : "/"} className="flex flex-none items-center text-ink no-underline" aria-label="HiveVoice">
          <span className="md:hidden"><LogoMark size={34} /></span>
          <span className="max-md:hidden"><Logo size={34} /></span>
        </Link>
        <QuickSearch className="min-w-0 flex-1" />
        <div className="flex flex-none items-center justify-end gap-2">
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
              <AccountMenu id={session.profile.id} name={session.profile.display_name} seed={session.profile.avatar_seed} path={session.profile.avatar_path} admin={session.profile.is_admin} />
            </>
          ) : (
            <>
              <span className="max-sm:hidden"><LanguageMenu /></span>
              <Link href="/login" className={btn.primary}>{t("login")}</Link>
            </>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar folded={fold === "folded" ? true : fold === "open" ? false : null} signedIn={!!session} badges={badges} />
        <main id="main" className="pane-titles min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}<Suspense><ActiveInView /></Suspense></main>
      </div>
      <BottomNav items={items} newLabel={t("new")} label={t("main")} signedIn={!!session} />
    </div>
  );
}
