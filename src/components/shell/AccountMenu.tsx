"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "../ui/Avatar";

/**
 * Top right: everything about the account (profile, settings, responsibilities, reports, principles, signing out).
 * Not the own content, that is the area "Ich" in the rail.
 */
export function AccountMenu({ id, name, seed, path, admin }: { id: string; name: string; seed: number; path: string | null; admin: boolean }) {
  const t = useTranslations("nav.account");
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  const item = "flex h-11 items-center border-b border-line px-4 text-ink no-underline hover:bg-chip";
  return (
    <details ref={ref} className="relative">
      <summary aria-label={t("open", { name })} className="inline-flex h-11 w-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <Avatar name={name} seed={seed} path={path} size={44} />
      </summary>
      <div onClick={(e) => { if ((e.target as HTMLElement).closest("a")) ref.current?.removeAttribute("open"); }}
        className="absolute right-0 z-40 mt-1 flex w-[min(280px,calc(100vw-2rem))] flex-col border border-ink bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name={name} seed={seed} path={path} size={40} />
          <span className="flex min-w-0 flex-col"><strong className="truncate">{name}</strong><span className="text-sm text-muted">{t("account")}</span></span>
        </div>
        <Link href={`/profile/${id}`} className={item}>{t("profile")}</Link>
        <Link href="/settings" className={item}>{t("settings")}</Link>
        <Link href="/settings?tab=resp" className={item}>{t("resp")}</Link>
        <Link href="/settings?tab=reports" className={item}>{t("reports")}</Link>
        {/* Server admins (ADMIN_EMAILS, confirmed address) switch to the admin view here. */}
        {admin && <Link href="/admin" className={`${item} font-bold`}>{t("admin")}</Link>}
        <Link href="/principles" className={item}>{t("principles")}</Link>
        <form method="post" action="/auth/signout">
          <button type="submit" className="flex h-11 w-full items-center border-0 bg-transparent px-4 text-left text-ink hover:bg-chip">{t("signOut")}</button>
        </form>
      </div>
    </details>
  );
}
