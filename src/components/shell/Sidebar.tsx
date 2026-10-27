"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { AreaIcon } from "../ui/Logo";
import { IconBoard, IconChat, IconDiagram, IconFlag, IconHands, IconHome, IconMail, IconNote, IconSidebar, IconUpload, IconUser, IconUsers, IconInbox } from "../ui/Icons";
import { AREAS, areaOf, type Area } from "./areas";

const watchWidth = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };

type Section = { href: string; label: string; icon: ComponentType<{ size?: number }>; badge?: number };

/**
 * Desktop: one sidebar. At the top the button that folds it, under it the sections of the area one is in
 * (icon and label), at the bottom the three areas side by side. Folded, only the icons stay and the three
 * areas move under each other. The choice is kept in a cookie, so the server draws it right away.
 */
export function Sidebar({ folded: initial, signedIn, badges }: { folded: boolean | null; signedIn: boolean; badges: { chats: number; requests: number } }) {
  return (
    <Suspense fallback={<Bar folded={initial ?? false} signedIn={signedIn} badges={badges} query={null} />}>
      <WithQuery initial={initial} signedIn={signedIn} badges={badges} />
    </Suspense>
  );
}

function WithQuery({ initial, signedIn, badges }: { initial: boolean | null; signedIn: boolean; badges: { chats: number; requests: number } }) {
  const query = useSearchParams();
  const [choice, setChoice] = useState<boolean | null>(initial);
  // Without a choice of one's own, narrow screens start folded.
  const narrow = useSyncExternalStore(watchWidth, () => window.innerWidth < 1024, () => false);
  const folded = choice ?? narrow;
  const toggle = () => {
    const next = !folded;
    setChoice(next);
    document.cookie = `hv_sidebar=${next ? "folded" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  return <Bar folded={folded} signedIn={signedIn} badges={badges} query={query} onToggle={toggle} />;
}

function Bar({ folded, signedIn, badges, query, onToggle }: {
  folded: boolean; signedIn: boolean; badges: { chats: number; requests: number }; query: URLSearchParams | ReturnType<typeof useSearchParams> | null; onToggle?: () => void;
}) {
  const t = useTranslations("nav");
  const tc = useTranslations("community.nav");
  const tf = useTranslations("connect.filter");
  const tm = useTranslations("mine.filters");
  const path = usePathname();
  // Pages outside the three areas (Neu, settings) keep the area one came from.
  const here = areaOf(path);
  const [last, setLast] = useState<Area>(here ?? (signedIn ? "friends" : "community"));
  if (here && here !== last) setLast(here);
  const area = here ?? last;

  const sections: Record<Area, Section[]> = {
    community: [
      { href: "/community", label: tc("board"), icon: IconBoard },
      { href: "/community/listings", label: tc("listings"), icon: IconHands },
      { href: "/community/groups", label: tc("groups"), icon: IconUsers },
      { href: "/community/people", label: tc("people"), icon: IconUser },
    ],
    friends: [
      { href: "/friends", label: tf("all"), icon: IconHome },
      { href: "/friends?f=chats", label: tf("chats"), icon: IconChat, badge: badges.chats },
      { href: "/friends?f=groups", label: tf("groups"), icon: IconUsers },
      { href: "/friends?f=requests", label: tf("requests"), icon: IconMail, badge: badges.requests },
      { href: "/friends?f=listings", label: tf("listings"), icon: IconHands },
    ],
    me: [
      { href: "/me", label: tm("all"), icon: IconHome },
      { href: "/me/listings", label: tm("listings"), icon: IconHands },
      { href: "/me/notes", label: tm("notes"), icon: IconNote },
      { href: "/me/diagrams", label: tm("diagrams"), icon: IconDiagram },
      { href: "/me/uploads", label: tm("uploads"), icon: IconUpload },
      { href: "/me/initiatives", label: tm("projects"), icon: IconFlag },
      // Account pages belong to Ich too, so the sidebar always says where one is.
      { href: "/notifications", label: t("notifications"), icon: IconInbox },
      { href: "/settings", label: t("settings"), icon: IconUser },
    ],
  };
  const list = sections[area];
  // The section that fits best: same path, then the same filter (?f=), longest match first.
  const score = (href: string) => {
    const [p, q] = href.split("?");
    if (!(path === p || (p !== "/community" && p !== "/friends" && p !== "/me" && path.startsWith(p + "/")))) return -1;
    const want = q ? new URLSearchParams(q).get("f") : null;
    const have = query?.get("f") ?? null;
    if (p === "/friends" && want !== have) return -1;
    return href.length;
  };
  const active = list.reduce((best, s, i) => (score(s.href) > (best < 0 ? -1 : score(list[best].href)) ? i : best), -1);

  const W = folded ? 64 : 248;
  const cell = folded ? 56 : (W - 16) / 3;
  return (
    <nav aria-label={t("main")} style={{ width: W }}
      className="sticky top-16 hidden h-[calc(100dvh-4rem)] flex-none flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out md:flex">
      <button type="button" onClick={onToggle} aria-expanded={!folded} aria-label={t(folded ? "unfold" : "fold")} title={t(folded ? "unfold" : "fold")}
        className="mx-2 mt-2 inline-flex h-10 w-10 flex-none items-center justify-center border-0 bg-transparent text-ink hover:bg-chip">
        <IconSidebar />
      </button>
      {!folded && <p className="m-0 truncate px-4 pb-1 pt-3 text-[13px] font-bold uppercase tracking-wide text-muted">{t(area)}</p>}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-1">
        {list.map((s, i) => {
          const on = i === active;
          const Icon = s.icon;
          return (
            <Link key={s.href} href={signedIn || area === "community" ? s.href : `/login?next=${encodeURIComponent(s.href)}`} aria-current={on ? "page" : undefined}
              title={folded ? s.label : undefined} aria-label={folded ? s.label : undefined}
              className={`relative flex h-11 flex-none items-center gap-3 border-l-4 px-4 text-ink no-underline ${on ? "border-ink bg-paper font-bold" : "border-transparent hover:bg-chip"}`}>
              <span className="relative inline-flex flex-none"><Icon size={20} />
                {!!s.badge && folded && <span className="absolute -right-2 -top-1.5 h-2.5 w-2.5 bg-red" aria-hidden="true" />}
              </span>
              {!folded && <span className="min-w-0 flex-1 truncate">{s.label}</span>}
              {!!s.badge && !folded && <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ink px-1 text-xs font-bold text-on-ink">{s.badge}</span>}
            </Link>
          );
        })}
      </div>
      {/* The three areas: side by side when open, under each other when folded; each slides to its place. */}
      <div className="relative flex-none border-t border-line transition-[height] duration-200 ease-out" style={{ height: folded ? cell * 3 + 16 : cell + 16 }}>
        {AREAS.map((a, i) => {
          const on = a === here;
          const x = folded ? 4 : 8 + i * cell;
          const y = folded ? 8 + i * cell : 8;
          return (
            <Link key={a} href={a === "me" && !signedIn ? "/login?next=/me" : `/${a === "me" ? "me" : a}`} aria-current={on ? "page" : undefined}
              aria-label={t(a)} title={t(a)}
              style={{ transform: `translate(${x}px, ${y}px)`, width: folded ? 56 : cell, height: cell }}
              className={`absolute left-0 top-0 flex flex-col items-center justify-center gap-1 text-[11px] leading-none text-ink no-underline transition-[transform,width,height] duration-200 ease-out ${on ? "bg-paper font-bold outline outline-2 -outline-offset-2 outline-ink" : "hover:bg-chip"}`}>
              <span className="relative inline-flex"><AreaIcon area={a} size={24} />
                {a === "friends" && badges.chats + badges.requests > 0 && <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center bg-red px-1 text-[10px] font-bold text-on-red">{badges.chats + badges.requests}</span>}
              </span>
              {!folded && <span className="max-w-full truncate px-1">{t(a)}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
