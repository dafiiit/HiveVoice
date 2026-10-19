import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Lead } from "@/components/ui/Lead";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { myRegionIds } from "@/lib/queries";
import { Avatar } from "@/components/ui/Avatar";
import { dateLong } from "@/lib/format";
import { chip, tab } from "@/components/ui/styles";
import { RequestForm } from "@/components/responsible/RequestForm";
import { LevelBadge } from "@/components/responsible/LevelBadge";
import { ConfirmButton } from "@/components/responsible/ConfirmButton";
import { DisputeButton } from "@/components/responsible/DisputeButton";
import { SentRequests, type SentItem } from "@/components/responsible/SentRequests";
import { Intake, type IntakeItem } from "@/components/responsible/Intake";

export async function generateMetadata() {
  return { title: (await getTranslations("responsible"))("title") };
}

type Resp = { id: string; title: string; organization_name: string | null; description: string; is_official: boolean; official_domain: string | null; avg_response_days: number | null;
  holder_id: string; holder_name: string; region_name: string | null; region_level: string | null; tags: string[];
  region_id: string | null; level: "official" | "community" | "self"; confirm_count: number; confirmed_by_me: boolean; endorsed: number; unanswered: number;
  vacant_at: string | null; sub_name: string | null; substitute_until: string | null; dispute_id: string | null; oldest_open_days: number | null };

export default async function Responsible({ searchParams }: PageProps<"/responsible">) {
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("responsible");
  const tr = await getTranslations("resprights");
  const tl = await getTranslations("levels");
  const locale = await getLocale();
  const view = sp.view === "intake" ? "intake" : sp.view === "sent" ? "sent" : "search";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const level = typeof sp.level === "string" ? sp.level : "all";
  const only = typeof sp.id === "string" && /^[0-9a-f-]{36}$/.test(sp.id) ? sp.id : null;

  const d = await asViewer(viewer, async (tx) => {
    const regions = await myRegionIds(tx, me);
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const rows = await tx<Resp[]>`
      select s.id, s.title, s.organization_name, s.description, s.is_official, s.official_domain::text, s.avg_response_days, s.holder_id,
             p.display_name as holder_name, r.name as region_name, r.level::text as region_level,
             coalesce((select array_agg(t.slug::text) from public.responsibility_tags rt join public.tags t on t.id = rt.tag_id where rt.responsibility_id = s.id), '{}') as tags,
             s.region_id, app.responsibility_level(s.id) as level, app.resp_confirm_count(s.id) as confirm_count,
             ${me ? tx`app.resp_confirmed_by_me(s.id)` : tx`false`} as confirmed_by_me,
             (select count(*)::int from public.responsibility_endorsements e where e.responsibility_id = s.id) as endorsed,
             app.resp_unanswered(s.id) as unanswered, s.vacant_at, sp.display_name as sub_name, s.substitute_until,
             (select d.id from public.responsibility_disputes d where d.responsibility_id = s.id and d.status in ('evidence', 'jury')) as dispute_id,
             (select extract(day from now() - min(q.created_at))::int from public.responsibility_requests q where q.responsibility_id = s.id and q.status = 'open') as oldest_open_days
      from public.responsibilities s join public.profiles p on p.id = s.holder_id left join public.regions r on r.id = s.region_id
      left join public.profiles sp on sp.id = s.substitute_id and (s.substitute_until is null or s.substitute_until >= current_date)
      where s.state = 'active'
        ${only ? tx`and s.id = ${only}` : tx``}
        ${level === "mine" ? tx`and s.region_id = any(${regions}::uuid[])` : level !== "all" ? tx`and r.level = ${level}` : tx``}
        ${words.length ? tx`and exists (select 1 from unnest(${words}::text[]) w where lower(s.title || ' ' || s.description || ' ' || coalesce(s.organization_name, '')) like '%' || w || '%'
            or exists (select 1 from public.responsibility_tags rt join public.tags t on t.id = rt.tag_id where rt.responsibility_id = s.id and t.slug like w || '%'))` : tx``}
      order by (case app.responsibility_level(s.id) when 'official' then 0 when 'community' then 1 else 2 end), (s.region_id = any(${regions}::uuid[])) desc, s.avg_response_days asc nulls last, s.title limit 50`;
    const [{ confirm_min, vacant_days, notice_days, dispute_days }] = await tx<{ confirm_min: number; vacant_days: number; notice_days: number; dispute_days: number }[]>`
      select app.param('resp_confirm_min') as confirm_min, app.param('resp_vacant_days') as vacant_days, app.param('resp_notice_days') as notice_days, app.param('resp_dispute_days') as dispute_days`;
    const adminGroups = me ? await tx<{ id: string; name: string; region_id: string | null }[]>`
      select g.id, g.name, g.region_id from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${me} and m.role = 'admin' and g.visibility = 'public' and g.archived_at is null and g.member_count >= 5 order by g.name` : [];
    const projects = me ? await tx<{ id: string; title: string; kind: "initiative" | "group" }[]>`
      select i.id, i.title, 'initiative' as kind from public.initiative_authors a join public.initiatives i on i.id = a.initiative_id where a.profile_id = ${me}
      union all select g.id, g.name, 'group' from public.group_members m join public.groups g on g.id = m.group_id where m.profile_id = ${me} and m.role in ('admin', 'maintainer')` : [];
    const mine = me ? await tx<{ id: string; label: string }[]>`select s.id, coalesce(s.organization_name || ' · ', '') || s.title as label from public.responsibilities s where app.is_resp_holder(s.id, ${me}) and s.state = 'active'` : [];
    const intake = view === "intake" && me ? await tx<IntakeItem[]>`
      select q.id, q.body, q.created_at, q.due_at, q.status::text, q.decision::text, q.response_body, a.display_name as author, s.title as resp_title,
             q.initiative_id, i.title as initiative_title, g.slug::text as group_slug, g.name as group_name, i.support_count as supporters
      from public.responsibility_requests q join public.responsibilities s on s.id = q.responsibility_id join public.profiles a on a.id = q.author_id
      left join public.initiatives i on i.id = q.initiative_id left join public.groups g on g.id = q.group_id
      where app.is_resp_holder(s.id, ${me}) order by (q.status = 'open') desc, q.due_at` : [];
    const others = view === "intake" ? await tx<{ id: string; label: string }[]>`
      select s.id, coalesce(s.organization_name || ' · ', '') || s.title as label from public.responsibilities s
      where s.state = 'active' and not app.is_resp_holder(s.id, ${me ?? "00000000-0000-0000-0000-000000000000"}) order by s.is_official desc, label limit 100` : [];
    const sent = view === "sent" && me ? await tx<SentItem[]>`
      select q.id, q.body, q.created_at, q.due_at, q.status::text, q.response_body, q.unanswered_at, (q.status = 'open' and q.due_at < now()) as overdue,
             s.title as resp_title, s.organization_name as org, q.initiative_id, i.title as initiative_title
      from public.responsibility_requests q join public.responsibilities s on s.id = q.responsibility_id left join public.initiatives i on i.id = q.initiative_id
      where q.author_id = ${me} order by (q.status = 'open') desc, q.created_at desc limit 50` : [];
    const sentOthers = view === "sent" && me ? await tx<{ id: string; label: string }[]>`
      select s.id, coalesce(s.organization_name || ' · ', '') || s.title as label from public.responsibilities s
      where s.state = 'active' and not app.is_resp_holder(s.id, ${me}) order by (case app.responsibility_level(s.id) when 'official' then 0 when 'community' then 1 else 2 end), label limit 100` : [];
    return { rows, projects, mine, intake, others, sent, sentOthers, confirm_min, vacant_days, notice_days, dispute_days, adminGroups, regions };
  });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, q, level, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "level" && v === "all") || (k === "view" && v === "search")) p.delete(k);
    return `/responsible${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 md:gap-6 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0">{t("title")}</h1>
        <Lead long={t("lead")} short={t("leadShort")} className="max-w-[720px]" />
      </div>
      {session && (
        <div role="tablist" className="flex border-b border-line">
          <Link role="tab" aria-selected={view === "search"} href={href({ view: "search" })} className={tab(view === "search")}>{t("search")}</Link>
          <Link role="tab" aria-selected={view === "sent"} href={href({ view: "sent" })} className={tab(view === "sent")}>{tr("sent.tab")}</Link>
          {d.mine.length > 0 && <Link role="tab" aria-selected={view === "intake"} href={href({ view: "intake" })} className={tab(view === "intake")}>{t("intakeTab")}</Link>}
        </div>
      )}
      {view === "search" && (
        <>
          <form action="/responsible" className="flex max-w-[720px] gap-2" role="search">
            <input type="search" name="q" defaultValue={q} placeholder={t("placeholder")} aria-label={t("search")} className="h-[52px] min-w-0 flex-1 border border-ink bg-surface px-3 text-ink" />
            <button type="submit" className="h-[52px] bg-ink px-5 font-bold text-on-ink">{t("find")}</button>
          </form>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("level")}>
            {["all", ...(session ? ["mine"] : []), "borough", "municipality", "state", "country"].map((l) => (
              <Link key={l} href={href({ level: l })} aria-pressed={level === l} className={`${chip(level === l)} no-underline`}>{l === "mine" ? t("myPlaces") : tl(l as "all")}</Link>
            ))}
          </div>
          <div className="flex flex-col border-t border-line">
            {d.rows.length === 0 && <p className="text-muted">{t("empty")}</p>}
            {d.rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start gap-4 border-b border-line py-5">
                <div className="flex min-w-[260px] flex-1 flex-col gap-1">
                  <span className="text-sm text-muted">{[r.region_name, r.region_level ? tl(r.region_level as "all") : null, ...r.tags.map((x) => `#${x}`)].filter(Boolean).join(" · ")}</span>
                  <strong className="text-xl">{r.description}</strong>
                  <span className="flex items-center gap-2">
                    <Avatar name={r.organization_name ?? r.holder_name} size={28} />
                    <Link href={`/profile/${r.holder_id}`} className="font-bold text-ink no-underline">{r.organization_name ? `${r.organization_name} · ${r.title}` : r.title}</Link>
                    <LevelBadge level={r.level} domain={r.official_domain} />
                  </span>
                  <span className="flex flex-col gap-0.5 text-sm">
                    {r.dispute_id && <Link href={`/responsible/dispute/${r.dispute_id}`} className="font-bold text-red">{tr("dispute.running")}</Link>}
                    {r.vacant_at && <span className="font-bold text-red">{tr("flags.vacant", { days: d.vacant_days })}</span>}
                    {!r.vacant_at && r.oldest_open_days != null && r.oldest_open_days >= d.notice_days && <span className="text-muted">{tr("flags.noAnswer", { days: r.oldest_open_days })}</span>}
                    {r.unanswered > 0 && <span className="text-muted">{tr("flags.unanswered", { n: r.unanswered })}</span>}
                    {r.sub_name && r.substitute_until && <span className="text-muted">{tr("flags.substitute", { name: r.sub_name, date: dateLong(r.substitute_until, locale) })}</span>}
                  </span>
                  {r.level === "self" && session && r.holder_id !== me && (
                    <ConfirmButton id={r.id} count={r.confirm_count} min={d.confirm_min} mine={r.confirmed_by_me} affected={!!r.region_id && d.regions.includes(r.region_id)}
                      groups={d.adminGroups.filter((g) => !!g.region_id)} endorsed={r.endorsed} />
                  )}
                  {r.level !== "official" && session && r.holder_id !== me && !r.dispute_id && <DisputeButton id={r.id} days={d.dispute_days} />}
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm">{t("avg")}</span>
                  <strong className="text-2xl">{r.avg_response_days != null ? t("days", { n: r.avg_response_days }) : "–"}</strong>
                </div>
                {session && r.holder_id !== me && <RequestForm responsibilityId={r.id} name={r.organization_name ?? r.title} projects={d.projects} />}
                {!session && <Link href="/login?next=/responsible" className="text-sm font-bold">{t("signIn")}</Link>}
              </div>
            ))}
          </div>
          <p className="m-0 max-w-[720px] text-sm text-muted">{t("footer")} <Link href="/me?tab=resp">{t("addOwn")}</Link></p>
        </>
      )}
      {view === "sent" && (
        <>
          <p className="m-0 max-w-[720px] text-sm">{tr("flags.answerTarget", { days: 14 })}</p>
          <SentRequests items={d.sent} others={d.sentOthers} />
        </>
      )}
      {view === "intake" && (
        <>
          <p className="m-0 max-w-[720px] text-sm">{t("intakeLead")}</p>
          <Intake items={d.intake} others={d.others} />
        </>
      )}
    </div>
  );
}
