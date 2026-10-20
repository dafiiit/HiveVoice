"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AreaIcon } from "../ui/Logo";
import { IconPlus } from "../ui/Icons";

export type Area = "community" | "friends" | "me";
export type NavItem = { area: Area; href: string; label: string; badge?: number };

// Pages that belong to an area without living under its address.
const ALSO: Record<Area, string[]> = {
  community: ["/community", "/listings", "/profile", "/initiatives", "/responsible", "/jury"],
  friends: ["/friends", "/groups", "/invite"],
  me: ["/me", "/links"],
};
const isActive = (path: string, area: Area) => ALSO[area].some((h) => path === h || path.startsWith(h + "/"));

/** The rail on the left (desktop), like in Teams: three areas, each with its icon from the logo, and "Neu" at the bottom. */
export function Rail({ items, newLabel, label }: { items: NavItem[]; newLabel: string; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[96px] flex-none flex-col items-stretch border-r border-line bg-paper md:flex">
      {items.map((it) => {
        const on = isActive(path, it.area);
        return (
          <Link key={it.area} href={it.href} aria-current={on ? "page" : undefined}
            className={`relative flex h-[76px] flex-col items-center justify-center gap-1.5 border-l-4 text-[11.5px] leading-none text-ink no-underline ${on ? "border-ink bg-surface font-bold" : "border-transparent hover:bg-surface"}`}>
            <span className="relative inline-flex">
              <AreaIcon area={it.area} size={30} />
              {!!it.badge && <span className="absolute -right-3 -top-2 inline-flex h-[18px] min-w-[18px] items-center justify-center bg-red px-1 text-[11px] font-bold text-on-red">{it.badge}</span>}
            </span>
            {it.label}
          </Link>
        );
      })}
      <Link href="/new" aria-label={newLabel} title={newLabel}
        className="mx-auto mb-5 mt-auto inline-flex h-12 w-12 items-center justify-center bg-ink text-on-ink no-underline">
        <IconPlus size={22} />
      </Link>
    </nav>
  );
}

/** Phones: the same three areas at the bottom, "Neu" in the middle. 4rem above the system gesture area. */
export function BottomNav({ items, newLabel, label }: { items: NavItem[]; newLabel: string; label: string }) {
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
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] auto-cols-fr grid-flow-col border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {cell(a)}
      {cell(b)}
      <Link href="/new" aria-label={newLabel} className="flex flex-col items-center justify-center gap-1 bg-ink text-[11px] font-bold leading-none text-on-ink no-underline">
        <IconPlus size={22} />
        {newLabel}
      </Link>
      {rest.map(cell)}
    </nav>
  );
}
