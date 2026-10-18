import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dateLong } from "@/lib/format";
import { resourceColumns, resourceFrom, type ResourceRow } from "@/lib/links/queries";
import { popularTags } from "@/lib/queries";
import { formatSize, isImage } from "@/lib/files";
import { Markdown } from "@/components/Markdown";
import { NoteEditor } from "@/components/links/NoteEditor";
import { Avatar } from "@/components/ui/Avatar";
import { btn } from "@/components/ui/styles";
import { ReportButton } from "@/components/ReportDialog";
import { PreviewImage } from "@/components/links/PreviewImage";
import { VoteButtons } from "@/components/links/VoteButtons";
import { TrustBadge } from "@/components/links/LinkCard";
import { DeleteLink } from "@/components/links/DeleteLink";

export async function generateMetadata({ params }: PageProps<"/links/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  const [r] = await asViewer(null, (tx) => tx<{ title: string }[]>`select title from public.resources where id = ${id}`);
  return { title: r?.title };
}

export default async function LinkPage({ params, searchParams }: PageProps<"/links/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("links");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [r] = await tx<ResourceRow[]>`select ${resourceColumns(tx, me)} from ${resourceFrom(tx)} where r.id = ${id}`;
    if (!r) return null;
    const body = r.origin === "note" ? (await tx<{ body_md: string | null }[]>`select body_md from public.resources where id = ${id}`)[0]?.body_md ?? "" : "";
    const ideas = r.origin === "note" && me && r.owner_id === me && sp.edit === "1" ? await popularTags(tx) : [];
    const canDelete = me ? r.owner_id === me || (!!r.group_id && (await tx`select 1 where app.group_role(${r.group_id}) in ('admin', 'maintainer')`).length > 0) : false;
    return { r, canDelete, body, ideas };
  });
  if (!data) notFound();
  const { r } = data;
  const tk = await getTranslations("knowledge");
  const kind = t.has(`kinds.${r.kind}`) ? t(`kinds.${r.kind}` as "kinds.page") : r.kind;
  const provider = t.has(`providers.${r.provider}`) ? t(`providers.${r.provider}` as "providers.web") : r.provider;
  const host = r.host.replace(/^www\./, "");
  const careful = r.safety === "caution";
  const isLink = r.origin === "link", isNote = r.origin === "note", isFile = r.origin === "file";
  const editing = isNote && sp.edit === "1" && !!me && r.owner_id === me;
  const photo = isFile && r.file_id && r.file_mime && isImage(r.file_mime);
  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-4 pb-6 pt-4 md:gap-6 md:px-10 md:pb-20 md:pt-10">
      <nav className="text-sm"><Link href="/explore?kind=links" className="text-ink">{t("back")}</Link></nav>
      {isLink && <PreviewImage src={r.preview.image} label={t(`kindShort.${r.kind}` as "kindShort.page")} sub={host} ratio="21 / 9" />}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{kind}</strong><span className="text-muted">· {provider}{isLink ? ` · ${host}` : ""}</span>
        {isLink && <span className="ml-auto"><TrustBadge trust={r.safety} /></span>}
      </div>
      <h1 className="display m-0 break-words">{r.title}</h1>
      {r.description && <p className="m-0 whitespace-pre-line text-lg">{r.description}</p>}
      {r.tags.length > 0 && <div className="flex flex-wrap gap-2">{r.tags.map((x) => <Link key={x} href={`/explore?kind=links&q=%23${x}`} className="inline-flex h-8 items-center border border-line px-3 text-sm text-ink no-underline">#{x}</Link>)}</div>}

      {isLink && (
        <section className={`flex flex-col gap-3 border-l-4 p-4 ${careful ? "border-red" : "border-ink"} bg-surface`}>
          <strong>{t(`trust.${r.safety}`)}</strong>
          <span className="text-sm">{t(`trustText.${r.safety}`)}</span>
          {r.notes.filter((n) => n !== "official").length > 0 && (
            <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">{r.notes.filter((n) => n !== "official").map((n) => <li key={n}>{t(`notes.${n}` as "notes.redirect")}</li>)}</ul>
          )}
          <span className="text-sm text-muted">{t("leaving")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer nofollow ugc" className={careful ? btn.secondaryLg : btn.primaryLg}>{careful ? t("openAnyway") : t("open")} ↗</a>
            <span className="truncate text-sm text-muted">{t("openHost", { host })}</span>
          </div>
        </section>
      )}

      {isFile && r.file_id && (
        <section aria-label={tk("uploadedFile")} className="flex flex-col gap-3 border-l-4 border-ink bg-surface p-4">
          {photo && (
            <a href={`/api/files/${r.file_id}`} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${r.file_id}`} alt={r.title} className="block max-h-[70dvh] max-w-full object-contain" />
            </a>
          )}
          <span className="text-sm">{tk("fileInfo", { name: r.file_name ?? "", size: formatSize(r.file_size ?? 0) })}</span>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/api/files/${r.file_id}${photo || r.file_mime === "application/pdf" ? "" : "?dl=1"}`} target={photo || r.file_mime === "application/pdf" ? "_blank" : undefined} rel="noopener" className={btn.primaryLg}>{photo || r.file_mime === "application/pdf" ? tk("openFile") : tk("downloadFile")}</a>
            {(photo || r.file_mime === "application/pdf") && <a href={`/api/files/${r.file_id}?dl=1`} className={btn.secondaryLg}>{tk("downloadFile")}</a>}
          </div>
          <span className="text-sm text-muted">{tk("ownContent")}</span>
        </section>
      )}

      {isNote && !editing && (
        <article className="border border-line bg-surface p-4 md:p-6">
          <Markdown source={data.body} />
          <p className="mb-0 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm text-muted">
            <span>{tk("updated", { date: dateLong(r.updated_at, locale) })}</span>
            {me && r.owner_id === me && <Link href={`/links/${r.id}?edit=1`} className="font-bold text-ink">{tk("edit")}</Link>}
          </p>
        </article>
      )}
      {editing && (
        <NoteEditor initial={{ id: r.id, title: r.title, description: r.description ?? "", body: data.body, tags: r.tags }} groups={[]} initialGroup={null} ideas={data.ideas} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-2 text-sm">
          <Avatar name={r.owner_name} seed={r.owner_seed} path={r.owner_path} size={32} />
          <span>
            {t("sharedBy")} <Link href={`/profile/${r.owner_id}`} className="font-bold text-ink">{r.owner_name}</Link>
            {r.group_name && <> · <Link href={`/groups/${r.group_slug}?tab=links`} className="text-ink">{t("inGroupName", { name: r.group_name })}</Link></>}
            <span className="text-muted"> · {dateLong(r.created_at, locale)}</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <VoteButtons id={r.id} score={r.score} mine={r.my_vote} canVote={!!me} />
          {me && r.owner_id !== me && <ReportButton type="resource" id={r.id} className="border-0 bg-transparent p-0 text-sm text-muted underline" />}
          {data.canDelete && <DeleteLink id={r.id} groupSlug={r.group_slug} />}
        </span>
      </div>
    </div>
  );
}
