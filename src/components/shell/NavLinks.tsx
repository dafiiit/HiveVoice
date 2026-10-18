"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { IconChat, IconCompass, IconPlus, IconSearch, IconShare } from "../ui/Icons";

export type NavItem = { href: string; label: string; badge?: number };

const ICONS: Record<string, ComponentType<{ size?: number }>> = { "/explore": IconCompass, "/needs": IconSearch, "/offers": IconShare, "/connect": IconChat };

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function SideLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <div className="flex flex-col border-t border-line">
      {items.map((it) => {
        const on = isActive(path, it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
            className={`flex h-[52px] items-center gap-3 border-b border-line text-ink no-underline ${on ? "font-bold" : ""}`}>
            <span className={`h-2.5 w-2.5 flex-none ${on ? "bg-ink" : "border border-ink"}`} aria-hidden="true" />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && (
              <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center bg-ink px-1.5 text-xs font-bold text-on-ink">{it.badge}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function BottomNav({ items, newLabel }: { items: NavItem[]; newLabel: string }) {
  const path = usePathname();
  // Mobile: four sections around the central "new" button, each with an icon and a short label.
  const [a, b, c, d] = items;
  const cell = (it: NavItem) => {
    const on = isActive(path, it.href);
    const Icon = ICONS[it.href] ?? IconCompass;
    return (
      <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
        className={`flex flex-col items-center justify-center gap-0.5 border-t-4 text-[11px] leading-none text-ink no-underline ${on ? "border-ink font-bold" : "border-transparent"}`}>
        <span className="relative inline-flex">
          <Icon size={22} />
          {!!it.badge && <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center bg-red px-1 text-[10px] font-bold text-on-red">{it.badge}</span>}
        </span>
        {it.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {cell(a)}
      {cell(b)}
      <Link href="/new" aria-label={newLabel} className="flex flex-col items-center justify-center gap-0.5 bg-ink text-[11px] font-bold leading-none text-on-ink no-underline">
        <IconPlus size={22} />
        {newLabel}
      </Link>
      {cell(c)}
      {cell(d)}
    </nav>
  );
}
