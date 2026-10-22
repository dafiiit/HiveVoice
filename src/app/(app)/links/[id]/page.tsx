import Link from "next/link";
import { getOrigin } from "@/lib/origin";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ShareMenu } from "@/components/refs/ShareMenu";
import { addsInfo, dateLong } from "@/lib/format";
import { resourceColumns, resourceFrom, type ResourceRow } from "@/lib/links/queries";
import { popularTags } from "@/lib/queries";
import { formatSize, isImage } from "@/lib/files";
import { Markdown } from "@/components/Markdown";
import { NoteEditor } from "@/components/links/NoteEditor";
import { DiagramEditor } from "@/components/links/DiagramEditor";
import { Avatar } from "@/components/ui/Avatar";
import { btn, tag } from "@/components/ui/styles";
import { ReportButton } from "@/components/ReportDialog";
import { PreviewImage } from "@/components/links/PreviewImage";
import { VoteButtons } from "@/components/links/VoteButtons";
import { TrustBadge } from "@/components/links/LinkCard";
import { DeleteLink } from "@/components/links/DeleteLink";
import { ShareAccess, CancelTransfer, type GrantRow } from "@/components/links/ShareAccess";
import { Comments, CopyButton, Suggestions, Versions, type CommentRow, type SuggestionRow, type VersionRow } from "@/components/links/DocExtras";
import { RestoreResource } from "@/components/links/RestoreResource";
import { WhyNot } from "@/components/WhyNot";
import { BackLink, Notice, Page } from "@/components/ui/Page";

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

// Where my own documents of each kind live inside Ich.
const SECTION: Record<string, string> = { note: "/me/notes", diagram: "/me/diagrams", link: "/me/uploads", file: "/me/uploads" };

const qs = (sp: Record<string, string | string[] | undefined>) => {
  const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
  return p.size ? `?${p}` : "";
};

/**
 * My own documents open in Ich next to their list; documents of others (or opened with a link key) stay on this page,
 * which is also the address shared with others.
 */
export default async function LinkPage({ params, searchParams }: PageProps<"/links/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (session && typeof sp.k !== "string" && /^[0-9a-f-]{36}$/.test(id)) {
    const [r] = await asViewer({ authId: session.authId, profileId: session.profile.id }, (tx) =>
      tx<{ origin: string }[]>`select origin from public.resources where id = ${id} and owner_id = ${session.profile.id}`);
    if (r) redirect(`${SECTION[r.origin]}/${id}${qs(sp)}`);
  }
  return <LinkView id={id} sp={sp} base={`/links/${id}`} />;
}

/** One document or upload. `base`: its address (inside Ich it is /me/notes/…); `embedded`: shown next to a list, without the back link. */
export async function LinkView({ id, sp, base, embedded = false }: { id: string; sp: Record<string, string | string[] | undefined>; base: string; embedded?: boolean }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const key = typeof sp.k === "string" && /^[0-9a-f]{32}$/.test(sp.k) ? sp.k : null;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("links");
  const tm = await getTranslations("mine");
  const td = await getTranslations("docrights");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [r] = await tx<ResourceRow[]>`select ${resourceColumns(tx, me)} from ${resourceFrom(tx)} where r.id = ${id}`;
    if (!r) return null;
    const [meta] = await tx<Meta[]>`
      select r2.visibility, r2.edit_mode, r2.allow_download, r2.license, r2.link_token, r2.version_no, r2.trashed_at, r2.copied_from, orig.title as copied_title,
             app.resource_level(r2.id) as level, app.resource_lock_status(r2.id) as lock
      from public.resources r2 left join public.resources orig on orig.id = r2.copied_from where r2.id = ${id}`;
    const body = r.origin === "note" || r.origin === "diagram" ? (await tx<{ body_md: string | null }[]>`select body_md from public.resources where id = ${id}`)[0]?.body_md ?? "" : "";
    const level = meta.level;
    const ideas = r.origin === "note" && level >= 3 && sp.edit === "1" ? await popularTags(tx) : [];
    const grants = level >= 4 ? await tx<GrantRow[]>`
      select g.id, g.level, g.expires_at, p.display_name as person_name, gr.name as group_name
      from public.resource_grants g left join public.profiles p on p.id = g.profile_id left join public.groups gr on gr.id = g.group_id
      where g.resource_id = ${id} and (g.expires_at is null or g.expires_at > now()) order by g.created_at` : [];
    const myGroups = me && (level >= 4 || level >= 1) ? await tx<{ id: string; name: string }[]>`
      select g.id, g.name from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${me} and m.role <> 'guest' and g.archived_at is null order by g.name limit 40` : [];
    const versions = (r.origin === "note" || r.origin === "diagram") && level >= 3 ? await tx<VersionRow[]>`
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
    const canCopy = !!me && r.owner_id !== me && (level >= 3 || ["cc_by", "cc_by_sa", "cc0"].includes(meta.license ?? "") || (meta.allow_download && meta.license !== "all_rights") || r.origin === "link");
    return { r, meta, body, ideas, grants, myGroups, versions, suggestions, comments, transfer: transfer ?? null, canCopy, level };
  }, { linkToken: key });
  if (!data) notFound();
  const { r, meta, level } = data;
  const tk = await getTranslations("knowledge");
  const kind = t.has(`kinds.${r.kind}`) ? t(`kinds.${r.kind}` as "kinds.page") : r.kind;
  const provider = t.has(`providers.${r.provider}`) ? t(`providers.${r.provider}` as "providers.web") : r.provider;
  const host = r.host.replace(/^www\./, "");
  const careful = r.safety === "caution";
  const isLink = r.origin === "link", isNote = r.origin === "note", isFile = r.origin === "file", isDiagram = r.origin === "diagram";
  const editing = (isNote || isDiagram) && sp.edit === "1" && level >= 3 && !meta.trashed_at;
  const suggesting = isNote && sp.suggest === "1" && level >= 2;
  const photo = isFile && r.file_id && r.file_mime && isImage(r.file_mime);
  const viewable = !!photo || r.file_mime === "application/pdf";
  const canDownload = meta.allow_download || level >= 3;
  const kq = key ? `k=${key}` : "";
  const fileUrl = (extra = "") => `/api/files/${r.file_id}${[extra, kq].filter(Boolean).length ? `?${[extra, kq].filter(Boolean).join("&")}` : ""}`;
  const origin = await getOrigin();
  const linkUrl = meta.visibility === "link" && meta.link_token ? `${origin}/links/${id}?k=${meta.link_token}` : null;
  // Drawing takes the whole pane: draw.io and a bar with name, save and close.
  if (isDiagram && editing) return <DiagramEditor id={id} title={r.title} svg={data.body} base={base.replace(/\/[^/]+$/, "")} />;
  const picture = isDiagram ? `data:image/svg+xml;base64,${Buffer.from(data.body).toString("base64")}` : null;
  const home = SECTION[r.origin] ?? "/me/uploads";
  return (
    <Page width="narrow">
      {!embedded && <BackLink href={home} label={tm(isNote ? "filters.notes" : isDiagram ? "filters.diagrams" : "filters.uploads")} />}
      {meta.trashed_at && level >= 4 && <RestoreResource id={id} />}
      {isLink && <PreviewImage src={r.preview.image} label={t(`kindShort.${r.kind}` as "kindShort.page")} sub={host} ratio="21 / 9" />}
      {!isNote && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <strong>{kind}</strong><span className="text-muted">{[addsInfo(kind, provider) ? provider : null, isLink ? host : null].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
          {isLink && <span className="ml-auto"><TrustBadge trust={r.safety} /></span>}
        </div>
      )}
      <h1 className="display m-0 break-words">{r.title}</h1>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar name={r.owner_name} seed={r.owner_seed} path={r.owner_path} size={28} />
        <Link href={`/profile/${r.owner_id}`} className="font-bold text-ink no-underline">{r.owner_name}</Link>
        {r.group_name && <Link href={`/groups/${r.group_slug}?tab=links`} className="text-ink underline">{t("inGroupName", { name: r.group_name })}</Link>}
        <span className="text-muted">{[dateLong(r.created_at, locale),
          isNote || isDiagram ? td("page.version", { n: meta.version_no }) : null,
          meta.license && meta.license !== "all_rights" ? td("license.shown", { name: td(`license.${meta.license}` as "license.cc_by") }) : null,
          meta.visibility === "me" ? td("page.private") : null,
          meta.visibility === "link" && level < 4 ? td("page.viaLink") : null].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
        {meta.copied_from && <Link href={`/links/${meta.copied_from}`} className="text-ink underline">· {td("page.copyOf", { title: meta.copied_title ?? "…" })}</Link>}
      </span>
      {r.description && <p className="m-0 whitespace-pre-line text-lg">{r.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {session && !meta.trashed_at && (
          <ShareMenu type="resource" id={id} title={r.title} className={btn.secondarySm}
            external={meta.visibility === "public" ? { url: `${origin}/links/${id}`, text: r.title } : undefined}
            access={level >= 4 && !editing && !suggesting ? (
              <ShareAccess bare id={id} origin={r.origin} visibility={meta.visibility} editMode={meta.edit_mode} allowDownload={meta.allow_download} license={meta.license}
                linkUrl={linkUrl} grants={data.grants} myGroups={data.myGroups} hasGroup={!!r.group_id} groupId={r.group_id} transferTo={data.transfer?.to_name ?? null} />
            ) : undefined} />
        )}
        {(isNote || isDiagram) && !editing && !suggesting && !meta.trashed_at && level >= 3 && <Link href={`${base}?edit=1`} className={btn.secondarySm}>{tk("edit")}</Link>}
        {isNote && !editing && !suggesting && !meta.trashed_at && level === 2 && <Link href={`${base}?suggest=1`} className={btn.secondarySm}>{td("page.suggest")}</Link>}
        {meta.lock && !meta.lock.mine && <span className="text-sm font-bold text-red">{td("page.locked")}</span>}
        {isNote && level < 3 && level !== 2 && !!me && <WhyNot action="resource.edit" objectId={id} />}
        <span className="ml-auto flex items-center gap-3">
          <VoteButtons id={r.id} score={r.score} mine={r.my_vote} canVote={!!me} />
          {me && r.owner_id !== me && <ReportButton type="resource" id={r.id} className={`${btn.linkMuted} text-sm`} />}
          {level >= 4 && !meta.trashed_at && <DeleteLink id={r.id} groupSlug={r.group_slug} home={home} />}
        </span>
      </div>
      {r.tags.length > 0 && <div className="flex flex-wrap gap-2">{r.tags.map((x) => <Link key={x} href={`/community?tag=${x}`} className={`${tag} text-ink no-underline`}>#{x}</Link>)}</div>}
      {sp.suggested === "1" && <Notice tone="status">{td("page.suggestSent")}</Notice>}

      {isLink && (
        <section className={`flex flex-col gap-3 border-l-4 p-4 ${careful ? "border-red" : "border-ink"} bg-surface`}>
          <strong>{t(`trust.${r.safety}`)}</strong>
          <span className="text-sm">{t(`trustText.${r.safety}`)}</span>
          {r.notes.filter((n) => n !== "official").length > 0 && (
            <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">{r.notes.filter((n) => n !== "official").map((n) => <li key={n}>{t(`notes.${n}` as "notes.redirect")}</li>)}</ul>
          )}
          <span className="text-sm text-muted">{t("leaving")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer nofollow ugc" className={careful ? btn.secondary : btn.primary}>{careful ? t("openAnyway") : t("open")} ↗</a>
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
              <a href={fileUrl(viewable ? "" : "dl=1")} target={viewable ? "_blank" : undefined} rel="noopener" className={btn.primary}>{viewable ? tk("openFile") : tk("downloadFile")}</a>
            )}
            {viewable && canDownload && <a href={fileUrl("dl=1")} className={btn.secondary}>{tk("downloadFile")}</a>}
          </div>
          {!canDownload && <span className="text-sm font-bold">{viewable ? td("page.noDownload") : td("page.noView")}</span>}
          <span className="text-sm text-muted">{tk("ownContent")}</span>
        </section>
      )}

      {isNote && !editing && !suggesting && (
        <article className="border border-line bg-surface p-4 md:p-6">
          <Markdown source={data.body} />
        </article>
      )}
      {picture && (
        <section aria-label={tm("kind.diagram")} className="flex flex-col gap-3">
          <div className="border border-line bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG as <img>: scripts inside never run */}
            <img src={picture} alt={r.title} className="mx-auto block max-h-[70dvh] max-w-full" />
          </div>
          {canDownload && <a href={picture} download={`${r.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "diagram"}.drawio.svg`} className={`${btn.secondarySm} self-start`}>{tk("downloadFile")}</a>}
          {!canDownload && <span className="text-sm font-bold">{td("page.noDownload")}</span>}
        </section>
      )}
      {(editing || suggesting) && (
        <NoteEditor mode={editing ? "edit" : "suggest"} initial={{ id: r.id, title: r.title, description: r.description ?? "", body: data.body, tags: r.tags }} groups={[]} initialGroup={null} ideas={data.ideas} />
      )}

      {data.canCopy && !meta.trashed_at && <CopyButton id={id} groups={data.myGroups} linkKey={key} />}

      {!editing && !suggesting && <Suggestions id={id} items={data.suggestions} />}
      {data.transfer && level >= 4 && <span className="flex items-center gap-2 text-sm">{td("access.transferPending", { name: data.transfer.to_name })} <CancelTransfer transferId={data.transfer.id} /></span>}
      {(isNote || isDiagram) && level >= 3 && !editing && !suggesting && meta.version_no > 1 && data.versions.length > 0 && <Versions id={id} versions={data.versions} canRestore />}
      <Comments id={id} items={data.comments} canComment={level >= 2 && !!me} me={me} canModerate={level >= 4} />
    </Page>
  );
}
