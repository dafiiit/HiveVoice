import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dateLong } from "@/lib/format";
import { resourceColumns, resourceFrom, type ResourceRow } from "@/lib/links/queries";
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

export default async function LinkPage({ params }: PageProps<"/links/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("links");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [r] = await tx<ResourceRow[]>`select ${resourceColumns(tx, me)} from ${resourceFrom(tx)} where r.id = ${id}`;
    if (!r) return null;
    const canDelete = me ? r.owner_id === me || (!!r.group_id && (await tx`select 1 where app.group_role(${r.group_id}) in ('admin', 'maintainer')`).length > 0) : false;
    return { r, canDelete };
  });
  if (!data) notFound();
  const { r } = data;
  const kind = t.has(`kinds.${r.kind}`) ? t(`kinds.${r.kind}` as "kinds.page") : r.kind;
  const provider = t.has(`providers.${r.provider}`) ? t(`providers.${r.provider}` as "providers.web") : r.provider;
  const host = r.host.replace(/^www\./, "");
  const careful = r.safety === "caution";
  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-4 pb-6 pt-4 md:gap-6 md:px-10 md:pb-20 md:pt-10">
      <nav className="text-sm"><Link href="/explore?kind=links" className="text-ink">{t("back")}</Link></nav>
      <PreviewImage src={r.preview.image} label={t(`kindShort.${r.kind}` as "kindShort.page")} sub={host} ratio="21 / 9" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{kind}</strong><span className="text-muted">· {provider} · {host}</span>
        <span className="ml-auto"><TrustBadge trust={r.safety} /></span>
      </div>
      <h1 className="display m-0 break-words">{r.title}</h1>
      {r.description && <p className="m-0 whitespace-pre-line text-lg">{r.description}</p>}
      {r.tags.length > 0 && <div className="flex flex-wrap gap-2">{r.tags.map((x) => <Link key={x} href={`/explore?kind=links&q=%23${x}`} className="inline-flex h-8 items-center border border-line px-3 text-sm text-ink no-underline">#{x}</Link>)}</div>}

      <section className={`flex flex-col gap-3 border-l-4 p-4 ${careful ? "border-red" : "border-ink"} bg-surface`}>
        <strong>{t(`trust.${r.safety}`)}</strong>
        <span className="text-sm">{t(`trustText.${r.safety}`)}</span>
        {r.notes.filter((n) => n !== "official").length > 0 && (
          <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">{r.notes.filter((n) => n !== "official").map((n) => <li key={n}>{t(`notes.${n}` as "notes.redirect")}</li>)}</ul>
        )}
        <span className="text-sm text-muted">{t("leaving")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <a href={r.url} target="_blank" rel="noopener noreferrer nofollow ugc" className={careful ? btn.secondaryLg : btn.primaryLg}>{careful ? t("openAnyway") : t("open")} ↗</a>
          <span className="truncate text-sm text-muted">{t("openHost", { host })}</span>
        </div>
      </section>

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
