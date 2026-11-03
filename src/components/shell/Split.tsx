import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { ComponentType } from "react";
import { Avatar } from "../ui/Avatar";
import { IconBack, IconPlus } from "../ui/Icons";
import { NoteIcon } from "../ui/NoteIcon";
import { btn } from "../ui/styles";
import { SearchScope } from "./SearchScope";
import { AutoOpen } from "./AutoOpen";
import { ListResizer } from "./ListResizer";
import { KeepPages } from "../KeepPages";

/** Titles inside an opened item are smaller than on a page of their own: the list next to it carries the weight. */
export const PANE_TITLES = "pane-titles";

export type ListRow = {
  key: string; href: string; title: string; sub?: string | null; meta?: string | null; tag?: string | null;
  badge?: number; active?: boolean; avatar?: { name: string; seed?: number; path?: string | null; group?: boolean };
  /** Without an avatar: the row's own emoji (a note's icon), else the standard icon of its kind (also in the folded list). */
  icon?: string | null; iconImage?: string | null; kindIcon?: ComponentType<{ size?: number }>;
};

/**
 * The list folded to a strip of icons (the button at the top of the sidebar; src/app/globals.css, [data-list-col]):
 * below 6rem only the icons stay, under each other. FOLDED_HIDE goes on everything else, FOLDED_ROW on a row.
 */
export const FOLDED_HIDE = "@max-[6rem]:hidden";
export const FOLDED_ROW = "@max-[6rem]:justify-center @max-[6rem]:px-0";
/** A square icon button in the folded list instead of a button with a label. */
export const FOLDED_SQUARE = "@max-[6rem]:h-10 @max-[6rem]:w-10 @max-[6rem]:flex-none @max-[6rem]:justify-center @max-[6rem]:px-0";

/**
 * The list column on wide screens with the line that changes its width. Its width lives in CSS (src/app/globals.css):
 * the dragged one or the standard one, or a strip of icons while folded, which opens while the pointer is over it.
 * On phones it fills the screen unless `hidden`.
 */
export function ListColumn({ id, label, hidden, className = "", children }: { id?: string; label?: string; hidden: boolean; className?: string; children: ReactNode }) {
  return (
    <div data-list-col className={`${hidden ? "max-md:hidden" : ""} relative flex min-h-0 w-full min-w-0 flex-1 flex-col md:flex-none`}>
      <section id={id} aria-label={label} className={`@container flex w-full min-w-0 flex-1 flex-col border-line bg-surface md:overflow-y-auto md:overflow-x-hidden md:border-r ${className}`}>
        {children}
      </section>
      <ListResizer />
    </div>
  );
}

/**
 * Every section of the three areas: the list in the middle (name, search, content) and the opened item on the right,
 * like Teams. On phones one of the two fills the screen; the detail has a way back to the list. On wide screens the line
 * between them can be dragged.
 */
export function Split({ list, detail, open }: { list: ReactNode; detail: ReactNode; open: boolean }) {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] md:min-h-0">
      <ListColumn hidden={open}>{list}</ListColumn>
      <section className={`${open ? "" : "max-md:hidden"} min-w-0 flex-1 md:overflow-y-auto ${PANE_TITLES}`}>{detail}</section>
    </div>
  );
}

/** Phones: back from the opened item to its list. */
export function BackToList({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 px-4 pt-3 text-sm text-ink no-underline md:hidden">
      <IconBack size={14} /> {label}
    </Link>
  );
}

/** The "+" of a list fills the column, as wide as the search under it (links, buttons and a menu alike). */
export const CREATE_SLOT = "flex flex-col [&>:not(h1)]:w-full [&>a]:justify-center [&>button]:justify-center [&_summary]:w-full [&_summary]:justify-center @max-[6rem]:[&>a]:w-10 @max-[6rem]:[&>a]:px-0 @max-[6rem]:[&_summary]:w-10 @max-[6rem]:[&_summary]:gap-0.5 @max-[6rem]:[&_summary]:px-0";

/** The list column: name, the "+" for this section, filters, rows; the search at the top filters it while typing. */
export async function ListPane({ id, title, create, search, rows, empty, top, children, autoOpen, footer }: {
  id: string; title: string; create?: { href: string; label: string } | ReactNode; /** What the header search calls this list ("Notizen"). */ search: string; rows: ListRow[]; empty: string;
  /** Filters or a short note under the "+". */ top?: ReactNode;
  /** Instead of rows (a feed, for example). */ children?: ReactNode;
  /** Wide screens: open this address when nothing is opened yet. */ autoOpen?: string;
  /** After the rows (a link to the trash, for example). */ footer?: ReactNode;
}) {
  const t = await getTranslations("connect");
  return (
    <div id={id} className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-surface px-4 pb-3 pt-4 @max-[6rem]:items-center @max-[6rem]:px-3">
        <h1 className="m-0 min-w-0 truncate text-[22px] font-bold leading-tight max-md:sr-only @max-[6rem]:sr-only">{title}</h1>
        {create && <div className={CREATE_SLOT}>{typeof create === "object" && "href" in create
          ? <Link href={create.href} title={create.label} aria-label={create.label} className={`${btn.primarySm} ${FOLDED_SQUARE}`}><IconPlus size={14} /> <span className={FOLDED_HIDE}>{create.label}</span></Link>
          : create}</div>}
        <SearchScope mode="filter" list={id} what={search} />
        {top}
      </div>
      {autoOpen && <AutoOpen href={autoOpen} />}
      {!children && <KeepPages hrefs={rows.map((r) => r.href)} />}
      {children ?? (
        <>
          {rows.map((r) => (
            <Link key={r.key} href={r.href} aria-current={r.active ? "true" : undefined} data-search={[r.title, r.sub ?? "", r.meta ?? "", r.tag ?? ""].join(" ").toLowerCase()}
              title={r.title} className={`flex items-center gap-3 border-b border-line px-4 py-3 text-ink no-underline ${FOLDED_ROW} ${r.active ? "bg-paper shadow-[inset_4px_0_0_var(--ink)]" : "hover:bg-paper"}`}>
              {r.avatar ? <Avatar name={r.avatar.name} seed={r.avatar.seed} path={r.avatar.path} size={40} group={r.avatar.group} />
                : (r.icon || r.iconImage || r.kindIcon) && <NoteIcon icon={r.icon} image={r.iconImage} fallback={r.kindIcon} />}
              <span className={`flex min-w-0 flex-1 flex-col ${FOLDED_HIDE}`}>
                <span className="flex items-baseline justify-between gap-2"><strong className="truncate">{r.title}</strong>{r.meta && <span className="flex-none text-xs text-muted @max-[17rem]:hidden">{r.meta}</span>}</span>
                {r.sub && <span className="truncate text-sm text-muted @max-[17rem]:hidden">{r.sub}</span>}
              </span>
              {!!r.badge && <span className="inline-flex h-5 min-w-5 @max-[6rem]:hidden items-center justify-center bg-ink px-1 text-xs font-bold text-on-ink">{r.badge}</span>}
              {r.tag && <span className="flex-none @max-[17rem]:hidden border border-line-strong px-1.5 py-0.5 text-xs font-bold">{r.tag}</span>}
            </Link>
          ))}
          <p data-search-none hidden={rows.length > 0} className={`m-0 px-4 py-6 text-sm text-muted ${FOLDED_HIDE}`}>{rows.length ? t("listNone") : empty}</p>
          {footer && <div className={FOLDED_HIDE}>{footer}</div>}
        </>
      )}
    </div>
  );
}

/** The right side before anything is chosen. */
export function Pick({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[50dvh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="m-0 max-w-[420px] text-muted">{text}</p>
      {children}
    </div>
  );
}
