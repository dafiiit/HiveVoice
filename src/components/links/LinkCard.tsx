import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ResourceRow } from "@/lib/links/queries";
import { relTime } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { IconCheck } from "../ui/Icons";
import { ReportButton } from "../ReportDialog";
import { PreviewImage } from "./PreviewImage";
import { VoteButtons } from "./VoteButtons";

/** Small badge: how far we trust the link. */
export async function TrustBadge({ trust }: { trust: ResourceRow["safety"] }) {
  const t = await getTranslations("links.trust");
  return (
    <span className={`inline-flex h-6 items-center gap-1 px-2 text-xs font-bold ${trust === "caution" ? "bg-red text-on-red" : trust === "trusted" ? "bg-ink text-on-ink" : "border border-ink text-ink"}`}>
      {trust !== "caution" ? <IconCheck size={11} /> : <span aria-hidden="true">!</span>} {t(trust)}
    </span>
  );
}

/** A shared link with preview, trust badge, votes and who shared it. */
export async function LinkCard({ r, me, canVote }: { r: ResourceRow; me: string | null; canVote: boolean }) {
  const t = await getTranslations("links");
  const locale = await getLocale();
  const kind = (k: string) => (t.has(`kinds.${k}`) ? t(`kinds.${k}` as "kinds.page") : k);
  const provider = t.has(`providers.${r.provider}`) ? t(`providers.${r.provider}` as "providers.web") : r.provider;
  return (
    <article className="flex flex-col gap-3 border border-ink border-t-[6px] bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{kind(r.kind)}</strong>
        {provider !== kind(r.kind) && <span className="text-muted">· {provider}</span>}
        <span className="ml-auto"><TrustBadge trust={r.safety} /></span>
      </div>
      <Link href={`/links/${r.id}`} tabIndex={-1} aria-hidden="true" className="block">
        <PreviewImage src={r.preview.image} label={t.has(`kindShort.${r.kind}`) ? t(`kindShort.${r.kind}` as "kindShort.page") : r.kind} sub={r.host.replace(/^www\./, "")} />
      </Link>
      <Link href={`/links/${r.id}`} className="text-lg font-bold leading-tight text-ink no-underline hover:underline">{r.title}</Link>
      {r.description && <p className="m-0 line-clamp-3 text-sm">{r.description}</p>}
      <span className="truncate text-xs text-muted">{r.host.replace(/^www\./, "")}</span>
      {r.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{r.tags.slice(0, 5).map((x) => <span key={x} className="inline-flex h-7 items-center border border-line px-2 text-xs">#{x}</span>)}</div>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <Avatar name={r.owner_name} seed={r.owner_seed} path={r.owner_path} size={22} />
          <span className="truncate">
            <Link href={`/profile/${r.owner_id}`} className="font-bold text-ink no-underline">{r.owner_name}</Link>
            {r.group_name && <> · <Link href={`/groups/${r.group_slug}`} className="text-muted">{t("inGroupName", { name: r.group_name })}</Link></>}
            {" "}· {relTime(r.created_at, locale)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <VoteButtons id={r.id} score={r.score} mine={r.my_vote} canVote={canVote} />
          {me && r.owner_id !== me && <ReportButton type="resource" id={r.id} className="border-0 bg-transparent p-0 text-xs text-muted underline" />}
        </span>
      </div>
    </article>
  );
}
