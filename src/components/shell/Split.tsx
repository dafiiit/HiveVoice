import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Avatar } from "../ui/Avatar";
import { IconBack, IconPlus } from "../ui/Icons";
import { btn } from "../ui/styles";
import { ListSearch } from "../connect/ListSearch";
import { AutoOpen } from "./AutoOpen";

/** Titles inside an opened item are smaller than on a page of their own: the list next to it carries the weight. */
export const PANE_TITLES = "pane-titles";

export type ListRow = {
  key: string; href: string; title: string; sub?: string | null; meta?: string | null; tag?: string | null;
  badge?: number; active?: boolean; avatar?: { name: string; seed?: number; path?: string | null; group?: boolean };
};

/**
 * Every section of the three areas: the list in the middle (name, search, content) and the opened item on the right,
 * like Teams. On phones one of the two fills the screen; the detail has a way back to the list.
 */
export function Split({ list, detail, open }: { list: ReactNode; detail: ReactNode; open: boolean }) {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] md:min-h-0">
      <section className={`${open ? "max-md:hidden" : ""} flex w-full min-w-0 flex-col border-line bg-surface md:w-[340px] md:flex-none md:overflow-y-auto md:border-r lg:w-[380px]`}>
        {list}
      </section>
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

/** The list column: name, the "+" for this section, a search that filters while typing, filters, rows. */
export async function ListPane({ id, title, create, searchLabel, rows, empty, top, children, autoOpen, footer }: {
  id: string; title: string; create?: { href: string; label: string } | ReactNode; searchLabel: string; rows: ListRow[]; empty: string;
  /** Filters or a short note under the search. */ top?: ReactNode;
  /** Instead of rows (a feed, for example). */ children?: ReactNode;
  /** Wide screens: open this address when nothing is opened yet. */ autoOpen?: string;
  /** After the rows (a link to the trash, for example). */ footer?: ReactNode;
}) {
  const t = await getTranslations("connect");
  return (
    <div id={id} className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-surface px-4 pb-3 pt-4">
        <div className="flex items-center justify-end gap-2 md:justify-between">
          <h1 className="m-0 min-w-0 truncate text-[22px] font-bold leading-tight max-md:sr-only">{title}</h1>
          {create && typeof create === "object" && "href" in create
            ? <Link href={create.href} aria-label={create.label} title={create.label} className={btn.primarySm}><IconPlus size={14} /> {create.label}</Link>
            : create}
        </div>
        <ListSearch listId={id} value="" keep={{}} label={searchLabel} action="" />
        {top}
      </div>
      {autoOpen && <AutoOpen href={autoOpen} />}
      {children ?? (
        <>
          {rows.map((r) => (
            <Link key={r.key} href={r.href} aria-current={r.active ? "true" : undefined} data-search={[r.title, r.sub ?? "", r.meta ?? "", r.tag ?? ""].join(" ").toLowerCase()}
              className={`flex items-center gap-3 border-b border-line px-4 py-3 text-ink no-underline ${r.active ? "bg-paper shadow-[inset_4px_0_0_var(--ink)]" : "hover:bg-paper"}`}>
              {r.avatar && <Avatar name={r.avatar.name} seed={r.avatar.seed} path={r.avatar.path} size={40} group={r.avatar.group} />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline justify-between gap-2"><strong className="truncate">{r.title}</strong>{r.meta && <span className="flex-none text-xs text-muted">{r.meta}</span>}</span>
                {r.sub && <span className="truncate text-sm text-muted">{r.sub}</span>}
              </span>
              {!!r.badge && <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ink px-1 text-xs font-bold text-on-ink">{r.badge}</span>}
              {r.tag && <span className="flex-none border border-line-strong px-1.5 py-0.5 text-xs font-bold">{r.tag}</span>}
            </Link>
          ))}
          <p data-search-none hidden={rows.length > 0} className="m-0 px-4 py-6 text-sm text-muted">{rows.length ? t("listNone") : empty}</p>
          {footer}
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
