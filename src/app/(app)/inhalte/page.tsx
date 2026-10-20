import Link from "next/link";
import { Notice, Page, PageHeader, Tabs } from "@/components/ui/Page";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { relTime } from "@/lib/format";
import { formatSize } from "@/lib/files";
import { Notes } from "@/components/me/Notes";
import { MyDocuments, type DocRow, type SharedRow, type IncomingTransfer } from "@/components/me/MyDocuments";
import { NewList } from "@/components/mine/TodoList";
import { IconLock, IconPlus } from "@/components/ui/Icons";
import { btn } from "@/components/ui/styles";

const FILTERS = ["all", "docs", "lists", "notes", "projects", "listings"] as const;
type Filter = (typeof FILTERS)[number];

export async function generateMetadata() {
  return { title: (await getTranslations("mine"))("title") };
}

type Item = { key: string; href: string; title: string; kind: string; vis: string; at: string; extra?: string };

export default async function Mine({ searchParams }: PageProps<"/inhalte">) {
  const sp = await searchParams;
  const session = await requireSession("/inhalte");
  const viewer = { authId: session.authId, profileId: session.profile.id };
  const me = session.profile.id;
  const f: Filter = (FILTERS as readonly string[]).includes(String(sp.f)) ? (sp.f as Filter) : "all";
  const t = await getTranslations("mine");
  const locale = await getLocale();

  const d = await asViewer(viewer, async (tx) => {
    const docs = await tx<DocRow[]>`
      select id, title, origin, visibility, license, version_no, trashed_at, updated_at from public.resources where owner_id = ${me} order by trashed_at nulls first, updated_at desc limit 200`;
    const lists = await tx<{ id: string; title: string; visibility: string; updated_at: string; total: number; done: number }[]>`
      select l.id, l.title, l.visibility, l.updated_at,
        (select count(*)::int from public.todo_items i where i.list_id = l.id) as total,
        (select count(*)::int from public.todo_items i where i.list_id = l.id and i.done_at is not null) as done
      from public.todo_lists l where l.owner_id = ${me} order by l.updated_at desc`;
    const notes = await tx<{ id: string; body: string; updated_at: string }[]>`select id, body, updated_at from public.notes where profile_id = ${me} order by updated_at desc`;
    const projects = await tx<{ id: string; title: string; updated_at: string }[]>`
      select i.id, i.title, i.updated_at from public.initiative_authors a join public.initiatives i on i.id = a.initiative_id where a.profile_id = ${me} order by i.updated_at desc`;
    const listings = await tx<{ id: string; title: string; kind: string; read_scope: string; created_at: string }[]>`
      select id, title, kind::text, read_scope, created_at from public.listings where owner_id = ${me} order by created_at desc limit 100`;
    const shared = f === "docs" ? await tx<SharedRow[]>`
      select r.id, r.title, g.level, o.display_name as owner from public.resource_grants g join public.resources r on r.id = g.resource_id join public.profiles o on o.id = r.owner_id
      where g.profile_id = ${me} and (g.expires_at is null or g.expires_at > now()) and r.trashed_at is null order by g.created_at desc limit 100` : [];
    const transfers = await tx<IncomingTransfer[]>`
      select t.id, r.title, p.display_name as by from public.resource_transfers t join public.resources r on r.id = t.resource_id join public.profiles p on p.id = t.from_id
      where t.to_id = ${me} and t.status = 'proposed'`;
    const [usage] = f === "docs" ? await tx<{ u: { used: number; limit: number } }[]>`select app.storage_usage() as u` : [{ u: { used: 0, limit: 0 } }];
    return { docs, lists, notes, projects, listings, shared, transfers, usage: usage.u };
  });

  const items: Item[] = [
    ...d.docs.filter((x) => !x.trashed_at).map((x) => ({ key: `r${x.id}`, href: `/links/${x.id}`, title: x.title, kind: x.origin === "note" ? "doc" : x.origin === "file" ? "file" : "link", vis: x.visibility, at: x.updated_at })),
    ...d.lists.map((x) => ({ key: `l${x.id}`, href: `/inhalte/listen/${x.id}`, title: x.title, kind: "list", vis: x.visibility, at: x.updated_at, extra: x.total ? t("listCount", { done: x.done, total: x.total }) : undefined })),
    ...d.projects.map((x) => ({ key: `i${x.id}`, href: `/initiatives/${x.id}`, title: x.title, kind: "project", vis: "public", at: x.updated_at })),
    ...d.listings.map((x) => ({ key: `o${x.id}`, href: `/anliegen/${x.id}`, title: x.title, kind: x.kind === "need" ? "need" : "offer", vis: x.read_scope, at: x.created_at })),
  ];
  const shown = items
    .filter((x) => f === "all" || (f === "docs" && ["doc", "file", "link"].includes(x.kind)) || (f === "lists" && x.kind === "list") || (f === "projects" && x.kind === "project") || (f === "listings" && (x.kind === "offer" || x.kind === "need")))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const counts: Record<Filter, number> = {
    all: items.length + d.notes.length, docs: d.docs.filter((x) => !x.trashed_at).length, lists: d.lists.length,
    notes: d.notes.length, projects: d.projects.length, listings: d.listings.length,
  };

  return (
    <Page>
      <PageHeader title={t("title")} mobileHidden
        actions={<><Link href="/new/link?mode=note" className={btn.primarySm}><IconPlus size={14} /> {t("newDoc")}</Link><NewList label={t("newList")} /></>}>
        <p className="m-0 flex items-center gap-2 text-sm text-muted"><IconLock size={14} /> {t("lead")}</p>
      </PageHeader>
      <Tabs label={t("filterLabel")} items={FILTERS.map((k) => ({
        href: k === "all" ? "/inhalte" : `/inhalte?f=${k}`, on: f === k,
        label: <>{t(`filters.${k}`)}{counts[k] > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{counts[k]}</span>}</>,
      }))} />

      {f === "notes" ? <Notes notes={d.notes} />
        : f === "docs" ? (
          <MyDocuments docs={d.docs} shared={d.shared} incoming={d.transfers} trashDays={30}
            usage={{ used: formatSize(d.usage.used), limit: formatSize(d.usage.limit) }} />
        ) : (
          <div className="flex max-w-[860px] flex-col">
            {f === "all" && d.notes.length > 0 && (
              <Link href="/inhalte?f=notes" className="flex items-center justify-between gap-3 border-b border-line py-3 text-ink no-underline">
                <span className="flex min-w-0 flex-col"><strong>{t("filters.notes")}</strong><span className="truncate text-sm text-muted">{d.notes[0].body}</span></span>
                <span className="flex-none text-sm text-muted">{t("notesCount", { n: d.notes.length })}</span>
              </Link>
            )}
            {shown.map((x) => (
              <Link key={x.key} href={x.href} className="flex items-center justify-between gap-3 border-b border-line py-3 text-ink no-underline">
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate">{x.title}</strong>
                  <span className="text-sm text-muted">{t(`kind.${x.kind}` as "kind.doc")}{x.extra ? ` · ${x.extra}` : ""} · {relTime(x.at, locale)}</span>
                </span>
                <span className={`flex-none px-1.5 py-0.5 text-xs font-bold ${x.vis === "me" ? "border border-line-strong" : "bg-chip"}`}>{t(`vis.${x.vis}` as "vis.me")}</span>
              </Link>
            ))}
            {shown.length === 0 && !(f === "all" && d.notes.length) && <Notice tone="hint" className="py-6 text-base">{f === "all" ? t("empty") : t("emptyFilter")}</Notice>}
          </div>
        )}
    </Page>
  );
}
