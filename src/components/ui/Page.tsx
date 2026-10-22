import Link from "next/link";
import type { ReactNode } from "react";
import { IconBack } from "./Icons";
import { sectionRule, sectionTitle, tab } from "./styles";

const frame = "px-4 pb-6 pt-4 md:px-10 md:pb-20 md:pt-10";
// Next to a list (Split) the pane is already the limit: there "narrow" fills it (globals.css, .page-narrow).
const narrow = "page-narrow max-w-[720px]";

/**
 * The frame of every page. Two widths only: "narrow" (720 px, the whole pane next to a list) for text and forms, "wide" for lists and grids.
 * With an `aside`, the content gets a column on the right on wide screens.
 */
export function Page({ width = "wide", aside, children, className = "" }: { width?: "narrow" | "wide"; aside?: ReactNode; children: ReactNode; className?: string }) {
  // Every page is a container: grids inside follow the room the page has (a pane next to a list is narrower than the screen).
  if (aside) {
    return (
      <div className="@container">
        <div className={`grid gap-5 md:gap-10 @5xl:grid-cols-[minmax(0,1fr)_320px] ${frame} ${className}`}>
          <div className={`flex min-w-0 flex-col gap-5 md:gap-8 ${width === "narrow" ? narrow : ""}`}>{children}</div>
          <aside className="flex min-w-0 flex-col gap-6">{aside}</aside>
        </div>
      </div>
    );
  }
  return <div className="@container"><div className={`flex min-w-0 flex-col gap-5 md:gap-8 ${frame} ${width === "narrow" ? narrow : ""} ${className}`}>{children}</div></div>;
}

/** "← Area" above a detail page: one link back to the area the thing belongs to. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 self-start text-sm text-ink no-underline hover:underline">
      <IconBack size={14} />
      {label}
    </Link>
  );
}

/**
 * Title of a page, with at most one sentence under it and actions (a create button) on the right.
 * `mobileHidden`: the three main areas hide the title on phones, where the bottom bar already says where you are.
 */
export function PageHeader({ title, lead, back, actions, mobileHidden = false, children }: {
  title: ReactNode; lead?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; mobileHidden?: boolean; children?: ReactNode;
}) {
  return (
    <header className={`flex flex-col gap-3 ${mobileHidden && !actions && !lead ? "max-md:sr-only" : ""}`}>
      {back && <BackLink {...back} />}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className={`display m-0 min-w-0 break-words ${mobileHidden ? "max-md:sr-only" : ""}`}>{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {lead && <p className="m-0 max-w-[720px]">{lead}</p>}
      {children}
    </header>
  );
}

/** A part of a page: one heading size, a line under it, optional actions on the right. */
export function Section({ title, actions, children, className = "", id }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className={`flex flex-wrap items-end justify-between gap-3 ${sectionRule}`}>
        <h2 className={sectionTitle}>{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export type TabItem = { href: string; label: ReactNode; on: boolean };

/**
 * Tabs that switch between the parts of one page (links, so every tab has its own address).
 * At most five stay visible; `more` goes into a "Mehr" menu at the end (the active one always shows).
 */
export function Tabs({ label, items, more = [], moreLabel = "Mehr" }: { label: string; items: TabItem[]; more?: TabItem[]; moreLabel?: string }) {
  const shown = [...items, ...more.filter((m) => m.on)];
  const rest = more.filter((m) => !m.on);
  return (
    <div className="flex border-b border-line">
      <div role="tablist" aria-label={label} className="flex min-w-0 overflow-x-auto">
        {shown.map((it) => (
          <Link key={it.href} role="tab" aria-selected={it.on} href={it.href} scroll={false} className={tab(it.on)}>{it.label}</Link>
        ))}
      </div>
      {rest.length > 0 && (
        <details className="group relative flex-none">
          <summary className={`${tab(false)} cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden`}>
            {moreLabel}<span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="absolute right-0 z-20 mt-1 flex min-w-[200px] flex-col border border-ink bg-surface">
            {rest.map((it) => <Link key={it.href} href={it.href} className="flex h-11 items-center border-b border-line px-3 text-ink no-underline last:border-b-0 hover:bg-chip">{it.label}</Link>)}
          </div>
        </details>
      )}
    </div>
  );
}

/** The row above a list: filter, sorting, a create button, and how many there are on the right. Always in this order. */
export function Toolbar({ children, count }: { children?: ReactNode; count?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {children}
      {count != null && <span className="ml-auto text-muted">{count}</span>}
    </div>
  );
}

/** A short message in the page: an error (red bar), a warning (red bar, not an alert), a status (black bar) or a quiet hint. */
export function Notice({ tone = "status", children, className = "" }: { tone?: "error" | "warning" | "status" | "hint"; children: ReactNode; className?: string }) {
  if (tone === "hint") return <p className={`m-0 text-sm text-muted ${className}`}>{children}</p>;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`border-l-4 bg-surface px-3 py-2.5 font-bold ${tone === "status" ? "border-ink" : "border-red"} ${className}`}>
      {children}
    </div>
  );
}
