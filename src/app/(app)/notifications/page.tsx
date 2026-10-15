import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { relTime } from "@/lib/format";

export async function generateMetadata() {
  return { title: (await getTranslations("notifications"))("title") };
}

type N = { id: string; kind: string; payload: Record<string, string | null>; read_at: string | null; created_at: string };

function link(n: N) {
  const p = n.payload;
  switch (n.kind) {
    case "join_request": return `/groups/${p.slug}?tab=team`;
    case "join_accepted": case "join_declined": case "goal_vote": case "goal_adopted": case "goal_rejected": return `/groups/${p.slug}`;
    case "working_group": return `/groups/${p.slug}`;
    case "initiative_vote": return `/initiatives/${p.initiative_id}?tab=vote`;
    case "initiative_passed": case "initiative_failed": return `/initiatives/${p.initiative_id}?tab=vote`;
    case "request_answered": case "request_forwarded": return p.initiative_id ? `/initiatives/${p.initiative_id}` : "/responsible";
    case "responsibility_request": return "/responsible?view=intake";
    case "contact_request": return p.request_id ? `/connect?c=c:${p.request_id}` : "/connect?f=requests";
    case "contact_accepted": return p.conversation_id ? `/connect?c=d:${p.conversation_id}` : "/connect?f=requests";
    case "contact_declined": return "/connect?f=requests";
    case "message": return `/connect?c=d:${p.conversation_id}`;
    case "post_reply": return p.group_id ? "/connect" : p.initiative_id ? `/initiatives/${p.initiative_id}?tab=threads` : "/connect";
    case "jury_invite": return `/jury/${p.case_id}`;
    case "report_decided": case "content_hidden": return "/me?tab=reports";
    default: return "/connect";
  }
}

export default async function Notifications() {
  const session = await requireSession("/notifications");
  const t = await getTranslations("notifications");
  const locale = await getLocale();
  const items = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => {
    const rows = await tx<N[]>`select id, kind, payload, read_at, created_at from public.notifications where profile_id = ${session.profile.id} order by created_at desc limit 100`;
    await tx`update public.notifications set read_at = now() where profile_id = ${session.profile.id} and read_at is null and kind <> 'message'`;
    return rows;
  });
  return (
    <div className="flex max-w-[860px] flex-col gap-6 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-12">
      <h1 className="display m-0">{t("title")}</h1>
      {items.length === 0 && <p className="m-0 text-muted">{t("empty")}</p>}
      <div className="flex flex-col border-t border-line">
        {items.map((n) => (
          <Link key={n.id} href={link(n)} className={`flex items-start gap-3 border-b border-line py-4 text-ink no-underline ${n.read_at ? "" : "font-bold"}`}>
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 flex-none ${n.read_at ? "border border-line-strong" : "bg-red"}`} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>{t(`kinds.${n.kind.startsWith("contact_") && !n.payload.title ? `${n.kind}_direct` : n.kind}`, { ...Object.fromEntries(Object.entries(n.payload).map(([k, v]) => [k, v ?? ""])) })}</span>
              <span className="text-sm font-normal text-muted">{relTime(n.created_at, locale)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
