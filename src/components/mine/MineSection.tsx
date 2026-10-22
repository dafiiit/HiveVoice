import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { relTime } from "@/lib/format";
import { BackToList, ListPane, Pick, Split, type ListRow } from "@/components/shell/Split";
import { NewList } from "./TodoList";
import Link from "next/link";
import { IconPlus } from "@/components/ui/Icons";
import { btn } from "@/components/ui/styles";
import { Popover } from "@/components/ui/Popover";

export type MineKind = "all" | "notes" | "diagrams" | "uploads" | "lists" | "projects" | "listings";

// Where each kind of my things lives inside Ich.
const BASE: Record<Exclude<MineKind, "all">, string> = { notes: "/me/notes", diagrams: "/me/diagrams", uploads: "/me/uploads", lists: "/me/lists", projects: "/me/initiatives", listings: "/me/listings" };

type Item = { kind: Exclude<MineKind, "all">; id: string; title: string; label: string; vis: string; at: string; extra?: string };

/**
 * Ich: one section of my own things as a list in the middle and the opened one on the right.
 * `detail` is what is opened (or the start page of the section), `selected` its id for the highlight.
 * `auto`: on wide screens the first item opens by itself when none is chosen.
 */
export async function MineSection({ kind, selected, detail, open, auto = true }: { kind: MineKind; selected?: string; detail?: ReactNode; open: boolean; auto?: boolean }) {
  const path = kind === "all" ? "/me" : BASE[kind];
  const session = await requireSession(path);
  const me = session.profile.id;
  const t = await getTranslations("mine");
  const locale = await getLocale();

  const d = await asViewer({ authId: session.authId, profileId: me }, async (tx) => ({
    docs: await tx<{ id: string; title: string; origin: string; visibility: string; updated_at: string }[]>`
      select id, title, origin, visibility, updated_at from public.resources where owner_id = ${me} and trashed_at is null order by updated_at desc limit 300`,
    lists: await tx<{ id: string; title: string; visibility: string; updated_at: string; total: number; done: number }[]>`
      select l.id, l.title, l.read_scope as visibility, l.updated_at,
        (select count(*)::int from public.todo_items i where i.list_id = l.id) as total,
        (select count(*)::int from public.todo_items i where i.list_id = l.id and i.done_at is not null) as done
      from public.todo_lists l where l.owner_id = ${me} order by l.updated_at desc`,
    // Initiatives I started or support.
    projects: await tx<{ id: string; title: string; updated_at: string }[]>`
      select i.id, i.title, i.updated_at from public.initiatives i
      where exists (select 1 from public.initiative_authors a where a.initiative_id = i.id and a.profile_id = ${me})
         or exists (select 1 from public.initiative_supports s where s.initiative_id = i.id and s.profile_id = ${me})
      order by i.updated_at desc`,
    listings: await tx<{ id: string; title: string; kind: string; read_scope: string; status: string; created_at: string }[]>`
      select id, title, kind::text, read_scope, status::text, created_at from public.listings where owner_id = ${me} and status in ('active', 'paused') order by created_at desc limit 200`,
  }));

  const items: Item[] = [
    ...d.docs.map((x): Item => ({ kind: x.origin === "note" ? "notes" : x.origin === "diagram" ? "diagrams" : "uploads", id: x.id, title: x.title, label: t(`kind.${x.origin === "note" || x.origin === "file" || x.origin === "diagram" ? x.origin : "link"}`), vis: x.visibility, at: x.updated_at })),
    ...d.lists.map((x): Item => ({ kind: "lists", id: x.id, title: x.title, label: t("kind.list"), vis: x.visibility, at: x.updated_at, extra: x.total ? t("listCount", { done: x.done, total: x.total }) : undefined })),
    ...d.projects.map((x): Item => ({ kind: "projects", id: x.id, title: x.title, label: t("kind.project"), vis: "public", at: x.updated_at })),
    ...d.listings.map((x): Item => ({ kind: "listings", id: x.id, title: x.title, label: t(`kind.${x.kind === "need" ? "need" : "offer"}`), vis: x.read_scope, at: x.created_at, extra: x.status === "paused" ? t("paused") : undefined })),
  ];
  const shown = items.filter((x) => kind === "all" || x.kind === kind).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const rows: ListRow[] = shown.map((x) => ({
    key: `${x.kind}:${x.id}`, href: kind === "all" ? `/me?o=${x.kind}:${x.id}` : `${BASE[x.kind]}/${x.id}`, title: x.title, active: x.id === selected,
    sub: [kind === "all" ? x.label : null, x.extra, relTime(x.at, locale)].filter(Boolean).join(" · "),
    tag: t(`vis.${x.vis}` as "vis.me"),
  }));

  const create = kind === "notes" ? { href: "/me/notes/new", label: t("newNote") }
    : kind === "diagrams" ? { href: "/me/diagrams/new", label: t("newDiagram") }
    : kind === "uploads" ? { href: "/me/uploads/new", label: t("newUpload") }
    : kind === "listings" ? { href: "/me/listings/new", label: t("newListing") }
    : kind === "projects" ? { href: "/new/initiative", label: t("newProject") }
    : kind === "lists" ? <NewList label={t("newList")} />
    // The overview: one "+" for everything that can be made here.
    : <Popover align="right" label={<><IconPlus size={14} /> {t("new")}</>}>
        <div className="flex flex-col" role="group" aria-label={t("new")}>
          {([["/me/notes/new", t("newNote")], ["/me/diagrams/new", t("newDiagram")], ["/me/uploads/new", t("newUpload")], ["/me/lists", t("newList")], ["/me/listings/new", t("newListing")], ["/new/initiative", t("newProject")]] as const).map(([href, label]) => (
            <Link key={href} href={href} className="flex h-10 items-center border-b border-line text-ink no-underline last:border-b-0">{label}</Link>
          ))}
        </div>
      </Popover>;
  const title = kind === "all" ? t("title") : t(`filters.${kind}`);
  // Nothing in this section yet: wide screens open the page that makes the first one (initiatives are made outside Ich).
  const startHere = kind !== "all" && kind !== "projects" && typeof create === "object" && create && "href" in create ? create.href : undefined;

  return (
    <Split open={open}
      list={
        <ListPane id={`mine-${kind}`} title={title} create={create} searchLabel={t("search")} rows={rows}
          empty={t(kind === "all" ? "empty" : kind === "notes" ? "emptyNotes" : kind === "diagrams" ? "emptyDiagrams" : kind === "uploads" ? "emptyUploads" : "emptyFilter")}
          autoOpen={!open && auto ? rows[0]?.href ?? startHere : undefined}
          footer={kind === "notes" || kind === "diagrams" || kind === "uploads" ? <Link href={`${path}?more=1`} className="block border-b border-line px-4 py-3 text-sm text-ink underline">{t("more")}</Link> : undefined} />
      }
      detail={open ? <>{<BackToList href={path} label={title} />}{detail}</>
        // Nothing there yet: say so on the right and offer the first step, instead of "choose on the left".
        : rows.length === 0 && kind !== "all" && create && typeof create === "object" && "href" in create
          ? <Pick text={t(kind === "notes" ? "emptyNotes" : kind === "diagrams" ? "emptyDiagrams" : kind === "uploads" ? "emptyUploads" : "emptyFilter")}><Link href={create.href} className={btn.primary}>{create.label}</Link></Pick>
          : rows.length === 0 && kind === "lists" ? <Pick text={t("emptyFilter")}><NewList label={t("newList")} /></Pick>
          : (detail ?? <Pick text={t(rows.length ? "pick" : "empty")} />)} />
  );
}
