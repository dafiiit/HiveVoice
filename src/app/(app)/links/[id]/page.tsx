import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ShareMenu } from "@/components/refs/ShareMenu";
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
import { ShareAccess, CancelTransfer, type GrantRow } from "@/components/links/ShareAccess";
import { Comments, CopyButton, Suggestions, Versions, type CommentRow, type SuggestionRow, type VersionRow } from "@/components/links/DocExtras";
import { RestoreResource } from "@/components/links/RestoreResource";
import { WhyNot } from "@/components/WhyNot";

export async function generateMetadata({ params }: PageProps<"/links/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  const [r] = await asViewer(null, (tx) => tx<{ title: string }[]>`select title from public.resources where id = ${id} and visibility in ('public', 'group')`);
  return { title: r?.title };
}

type Meta = {
  visibility: string; edit_mode: string; allow_download: boolean; license: string | null; link_token: string | null; version_no: number;
  trashed_at: string | null; copied_from: string | null; copied_title: string | null; level: number; lock: { holder: string; mine: boolean } | null;
};

export default async function LinkPage({ params, searchParams }: PageProps<"/links/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const key = typeof sp.k === "string" && /^[0-9a-f]{32}$/.test(sp.k) ? sp.k : null;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("links");
  const td = await getTranslations("docrights");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [r] = await tx<ResourceRow[]>`select ${resourceColumns(tx, me)} from ${resourceFrom(tx)} where r.id = ${id}`;
    if (!r) return null;
    const [meta] = await tx<Meta[]>`
      select r2.visibility, r2.edit_mode, r2.allow_download, r2.license, r2.link_token, r2.version_no, r2.trashed_at, r2.copied_from, orig.title as copied_title,
             app.resource_level(r2.id) as level, app.resource_lock_status(r2.id) as lock
      from public.resources r2 left join public.resources orig on orig.id = r2.copied_from where r2.id = ${id}`;
    const body = r.origin === "note" ? (await tx<{ body_md: string | null }[]>`select body_md from public.resources where id = ${id}`)[0]?.body_md ?? "" : "";
    const level = meta.level;
    const ideas = r.origin === "note" && level >= 3 && sp.edit === "1" ? await popularTags(tx) : [];
    const grants = level >= 4 ? await tx<GrantRow[]>`
      select g.id, g.level, g.expires_at, p.display_name as person_name, gr.name as group_name
      from public.resource_grants g left join public.profiles p on p.id = g.profile_id left join public.groups gr on gr.id = g.group_id
      where g.resource_id = ${id} and (g.expires_at is null or g.expires_at > now()) order by g.created_at` : [];
    const myGroups = me && (level >= 4 || level >= 1) ? await tx<{ id: string; name: string }[]>`
      select g.id, g.name from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${me} and m.role <> 'guest' and g.archived_at is null order by g.name limit 40` : [];
    const versions = r.origin === "note" && level >= 3 ? await tx<VersionRow[]>`
      select v.version_no, v.note, p.display_name as editor, v.created_at from public.resource_versions v left join public.profiles p on p.id = v.editor_id
      where v.resource_id = ${id} order by v.version_no desc limit 30` : [];
    const [approve] = me ? await tx<{ ok: boolean }[]>`select app.can_approve_resource(${id}) as ok` : [{ ok: false }];
    const suggestions = approve.ok ? await tx<SuggestionRow[]>`
      select s.id, p.display_name as author, s.note, s.created_at, (s.base_version <> ${meta.version_no}) as stale
      from public.resource_suggestions s join public.profiles p on p.id = s.author_id where s.resource_id = ${id} and s.status = 'open' order by s.created_at` : [];
    const comments = await tx<CommentRow[]>`
      select c.id, p.display_name as author, c.author_id, c.body, c.created_at from public.resource_comments c join public.profiles p on p.id = c.author_id
      where c.resource_id = ${id} order by c.created_at limit 100`;
    const [transfer] = level >= 4 ? await tx<{ id: string; to_name: string }[]>`
      select t.id, p.display_name as to_name from public.resource_transfers t join public.profiles p on p.id = t.to_id where t.resource_id = ${id} and t.status = 'proposed'` : [];
    const canCopy = !!me && (level >= 3 || ["cc_by", "cc_by_sa", "cc0"].includes(meta.license ?? "") || (meta.allow_download && meta.license !== "all_rights") || r.origin === "link");
    return { r, meta, body, ideas, grants, myGroups, versions, suggestions, comments, transfer: transfer ?? null, canCopy, level };
  }, { linkToken: key });
  if (!data) notFound();
  const { r, meta, level } = data;
  const tk = await getTranslations("knowledge");
  const kind = t.has(`kinds.${r.kind}`) ? t(`kinds.${r.kind}` as "kinds.page") : r.kind;
  const provider = t.has(`providers.${r.provider}`) ? t(`providers.${r.provider}` as "providers.web") : r.provider;
  const host = r.host.replace(/^www\./, "");
  const careful = r.safety === "caution";
  const isLink = r.origin === "link", isNote = r.origin === "note", isFile = r.origin === "file";
  const editing = isNote && sp.edit === "1" && level >= 3;
  const suggesting = isNote && sp.suggest === "1" && level >= 2;
  const photo = isFile && r.file_id && r.file_mime && isImage(r.file_mime);
  const viewable = !!photo || r.file_mime === "application/pdf";
  const canDownload = meta.allow_download || level >= 3;
  const kq = key ? `k=${key}` : "";
  const fileUrl = (extra = "") => `/api/files/${r.file_id}${[extra, kq].filter(Boolean).length ? `?${[extra, kq].filter(Boolean).join("&")}` : ""}`;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const linkUrl = meta.visibility === "link" && meta.link_token ? `${origin}/links/${id}?k=${meta.link_token}` : null;
  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-4 pb-6 pt-4 md:gap-6 md:px-10 md:pb-20 md:pt-10">
      <nav className="text-sm"><Link href="/explore?kind=links" className="text-ink">{t("back")}</Link></nav>
      {meta.trashed_at && level >= 4 && <RestoreResource id={id} />}
      {isLink && <PreviewImage src={r.preview.image} label={t(`kindShort.${r.kind}` as "kindShort.page")} sub={host} ratio="21 / 9" />}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{kind}</strong><span className="text-muted">· {provider}{isLink ? ` · ${host}` : ""}</span>
        {isLink && <span className="ml-auto"><TrustBadge trust={r.safety} /></span>}
      </div>
      <h1 className="display m-0 break-words">{r.title}</h1>
      {r.description && <p className="m-0 whitespace-pre-line text-lg">{r.description}</p>}
      {session && !meta.trashed_at && <ShareMenu type="resource" id={id} title={r.title} className={`${btn.secondary} self-start`} />}
      {r.tags.length > 0 && <div className="flex flex-wrap gap-2">{r.tags.map((x) => <Link key={x} href={`/explore?kind=links&q=%23${x}`} className="inline-flex h-8 items-center border border-line px-3 text-sm text-ink no-underline">#{x}</Link>)}</div>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {meta.visibility === "me" && <span>{td("page.private")}</span>}
        {meta.visibility === "link" && level < 4 && <span>{td("page.viaLink")}</span>}
        {meta.license && <span>{td("license.shown", { name: td(`license.${meta.license}` as "license.cc_by") })}</span>}
        {isNote && <span>{td("page.version", { n: meta.version_no })}</span>}
        {meta.copied_from && <Link href={`/links/${meta.copied_from}`} className="text-ink">{td("page.copyOf", { title: meta.copied_title ?? "…" })}</Link>}
      </div>
      {sp.suggested === "1" && <p role="status" className="m-0 border-l-4 border-ink pl-3 font-bold">{td("page.suggestSent")}</p>}

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
            <a href={fileUrl()} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl()} alt={r.title} className="block max-h-[70dvh] max-w-full object-contain" />
            </a>
          )}
          <span className="text-sm">{tk("fileInfo", { name: r.file_name ?? "", size: formatSize(r.file_size ?? 0) })}</span>
          <div className="flex flex-wrap items-center gap-3">
            {(viewable || canDownload) && (
              <a href={fileUrl(viewable ? "" : "dl=1")} target={viewable ? "_blank" : undefined} rel="noopener" className={btn.primaryLg}>{viewable ? tk("openFile") : tk("downloadFile")}</a>
            )}
            {viewable && canDownload && <a href={fileUrl("dl=1")} className={btn.secondaryLg}>{tk("downloadFile")}</a>}
          </div>
          {!canDownload && <span className="text-sm font-bold">{viewable ? td("page.noDownload") : td("page.noView")}</span>}
          <span className="text-sm text-muted">{tk("ownContent")}</span>
        </section>
      )}

      {isNote && !editing && !suggesting && (
        <article className="border border-line bg-surface p-4 md:p-6">
          <Markdown source={data.body} />
          <p className="mb-0 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm text-muted">
            <span>{tk("updated", { date: dateLong(r.updated_at, locale) })}</span>
            {level >= 3 && !meta.trashed_at && <Link href={`/links/${r.id}?edit=1`} className="font-bold text-ink">{tk("edit")}</Link>}
            {level === 2 && !meta.trashed_at && <Link href={`/links/${r.id}?suggest=1`} className="font-bold text-ink">{td("page.suggest")}</Link>}
            {meta.lock && !meta.lock.mine && <span className="font-bold text-red">{td("page.locked")}</span>}
            {level < 3 && level !== 2 && !!me && <WhyNot action="resource.edit" objectId={id} />}
          </p>
        </article>
      )}
      {(editing || suggesting) && (
        <NoteEditor mode={editing ? "edit" : "suggest"} initial={{ id: r.id, title: r.title, description: r.description ?? "", body: data.body, tags: r.tags }} groups={[]} initialGroup={null} ideas={data.ideas} />
      )}

      {data.canCopy && !meta.trashed_at && <CopyButton id={id} groups={data.myGroups} linkKey={key} />}

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
          {level >= 4 && !meta.trashed_at && <DeleteLink id={r.id} groupSlug={r.group_slug} />}
        </span>
      </div>

      {!editing && !suggesting && <Suggestions id={id} items={data.suggestions} />}
      {level >= 4 && !editing && !suggesting && (
        <ShareAccess id={id} origin={r.origin} visibility={meta.visibility} editMode={meta.edit_mode} allowDownload={meta.allow_download} license={meta.license}
          linkUrl={linkUrl} grants={data.grants} myGroups={data.myGroups} hasGroup={!!r.group_id} groupId={r.group_id} transferTo={data.transfer?.to_name ?? null} />
      )}
      {data.transfer && level >= 4 && <span className="flex items-center gap-2 text-sm">{td("access.transferPending", { name: data.transfer.to_name })} <CancelTransfer transferId={data.transfer.id} /></span>}
      {isNote && level >= 3 && !editing && !suggesting && data.versions.length > 0 && <Versions id={id} versions={data.versions} canRestore />}
      <Comments id={id} items={data.comments} canComment={level >= 2 && !!me} me={me} canModerate={level >= 4} />
    </div>
  );
}
