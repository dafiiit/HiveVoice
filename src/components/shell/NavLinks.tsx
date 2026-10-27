"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AreaIcon } from "../ui/Logo";
import { IconPlus } from "../ui/Icons";

import { areaOf, type Area } from "./areas";

export type NavItem = { area: Area; href: string; label: string; badge?: number };
const isActive = (path: string, area: Area) => areaOf(path) === area;

/** Phones: the same three areas at the bottom, "Neu" in the middle. 4rem above the system gesture area. */
export function BottomNav({ items, newLabel, label, signedIn = true }: { items: NavItem[]; newLabel: string; label: string; signedIn?: boolean }) {
  const path = usePathname();
  const cell = (it: NavItem) => {
    const on = isActive(path, it.area);
    return (
      <Link key={it.area} href={it.href} aria-current={on ? "page" : undefined}
        className={`flex flex-col items-center justify-center gap-1 border-t-4 text-[11px] leading-none text-ink no-underline ${on ? "border-ink font-bold" : "border-transparent"}`}>
        <span className="relative inline-flex">
          <AreaIcon area={it.area} size={24} />
          {!!it.badge && <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center bg-red px-1 text-[10px] font-bold text-on-red">{it.badge}</span>}
        </span>
        {it.label}
      </Link>
    );
  };
  const [a, b, ...rest] = items;
  return (
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] auto-cols-[minmax(0,1fr)] grid-flow-col border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {cell(a)}
      {cell(b)}
      {/* Guests cannot make anything yet: no "Neu" for them. */}
      {signedIn && <Link href="/new" aria-label={newLabel} className="flex flex-col items-center justify-center gap-1 bg-ink text-[11px] font-bold leading-none text-on-ink no-underline">
        <IconPlus size={22} />
        {newLabel}
      </Link>}
      {rest.map(cell)}
    </nav>
  );
}
