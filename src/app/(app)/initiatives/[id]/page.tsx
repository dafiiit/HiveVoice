import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer, sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts } from "@/lib/posts";
import { dateLong, daysUntil, euro, num } from "@/lib/format";
import { PhaseRail } from "@/components/InitiativeCard";
import { Cover } from "@/components/ui/Cover";
import { Avatar } from "@/components/ui/Avatar";
import { Glyph } from "@/components/ui/Glyph";
import { IconCheck } from "@/components/ui/Icons";
import { tab, tag } from "@/components/ui/styles";
import { SupportButton } from "@/components/initiative/SupportButton";
import { ArgumentBoard, type ArgumentView } from "@/components/initiative/ArgumentBoard";
import { AuthorTools } from "@/components/initiative/AuthorTools";
import { CoAuthors, type AuthorRow, type PendingInvite, type RemovalRow } from "@/components/initiative/CoAuthors";
import { AuthorInviteBanner } from "@/components/initiative/AuthorInviteBanner";
import { BlockInitiative } from "@/components/initiative/BlockInitiative";
import { ShareBlock } from "@/components/ShareBlock";
import { WhyNot } from "@/components/WhyNot";
import { BallotPanel, type BallotView } from "@/components/BallotPanel";
import { Composer, PostList } from "@/components/PostList";

const TABS = ["about", "threads", "arguments", "vote", "implementation", "history"] as const;

type Ini = {
  id: string; title: string; summary: string | null; body: string | null; body_easy: string | null; phase: "idea" | "debate" | "addressee" | "implementation" | "done";
  outcome: "rejected_vote" | "rejected_addressee" | "withdrawn" | null; support_count: number; argument_count: number; thread_count: number;
  cost_estimate_cents: number | null; cover_seed: number; cover_path: string | null; created_at: string; updated_at: string; response_due_at: string | null;
  region_id: string; region_name: string; region_level: string; addressee_text: string | null; resp_id: string | null; resp_title: string | null;
  resp_org: string | null; resp_official: boolean | null; resp_days: number | null; group_slug: string | null; group_name: string | null;
  group_id: string | null; lead_id: string | null; blocked_at: string | null; blocked_reason: string | null; withdrawn_at: string | null; withdrawn_note: string | null;
  published_at: string | null;
};

export async function generateMetadata({ params }: PageProps<"/initiatives/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  const [row] = await asViewer(null, (tx) => tx<{ title: string; summary: string | null }[]>`select title, summary from public.initiatives where id = ${id}`);
  return row ? { title: row.title, description: row.summary ?? undefined } : {};
}

export default async function InitiativePage({ params, searchParams }: PageProps<"/initiatives/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const active = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as (typeof TABS)[number]) : "about";
  const easy = sp.easy === "1";
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("initiative");
  const tl = await getTranslations("levels");
  const tr = await getTranslations("inirights");
  const locale = await getLocale();
  const path = `/initiatives/${id}`;

  // Close due ballots lazily; the scheduler does the same every five minutes.
  await sql`select app.tick()`;

  const data = await asViewer(viewer, async (tx) => {
    const [ini] = await tx<Ini[]>`
      select i.*, r.name as region_name, r.level::text as region_level, s.id as resp_id, s.title as resp_title,
             s.organization_name as resp_org, s.is_official as resp_official, s.avg_response_days as resp_days,
             g.slug as group_slug, g.name as group_name
      from public.initiatives i join public.regions r on r.id = i.region_id
      left join public.responsibilities s on s.id = i.addressee_responsibility_id
      left join public.groups g on g.id = i.group_id
      where i.id = ${id}`;
    if (!ini) return null;
    const authors = await tx<{ id: string; display_name: string; avatar_seed: number; avatar_path: string | null; display_mode: string }[]>`
      select p.id, p.display_name, p.avatar_seed, p.avatar_path, p.display_mode from public.initiative_authors a join public.profiles p on p.id = a.profile_id
      where a.initiative_id = ${id} order by (p.id = ${ini.lead_id}) desc, p.display_name`;
    const tags = await tx<{ slug: string }[]>`select t.slug::text from public.initiative_tags it join public.tags t on t.id = it.tag_id where it.initiative_id = ${id}`;
    const supported = me ? (await tx`select 1 from public.initiative_supports where initiative_id = ${id} and profile_id = ${me}`).length > 0 : false;
    const [ballot] = await tx<BallotView[]>`
      select id, question, status::text, closes_at, quorum_pct, subject_type::text, result from public.ballots
      where initiative_id = ${id} order by (status = 'open') desc, created_at desc limit 1`;
    const participation = ballot && me ? (await tx<{ segment: string }[]>`select segment::text from public.ballot_participation where ballot_id = ${ballot.id} and profile_id = ${me}`)[0] : undefined;
    const [{ turnout }] = ballot ? await tx<{ turnout: { voters: Record<string, number> | null; eligible: number } | null }[]>`select app.ballot_turnout(${ballot.id}) as turnout` : [{ turnout: null }];
    const affected = me ? (await tx`select 1 from public.user_regions where profile_id = ${me} and region_id = ${ini.region_id}`).length > 0 : false;
    const args = await tx<ArgumentView[]>`
      select a.id, a.side::text, a.body, coalesce((select array_agg(x) from jsonb_array_elements_text(a.sources) x), '{}') as sources,
             a.author_id, p.display_name as author_name, p.avatar_seed as author_seed, p.avatar_path as author_path, p.display_mode as author_mode,
             a.created_at, a.support_count, a.bridge_score::float as bridge_score,
             ${me ? tx`exists (select 1 from public.argument_supports s where s.argument_id = a.id and s.profile_id = ${me})` : tx`false`} as supported,
             coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'author_name', rp.display_name, 'author_seed', rp.avatar_seed) order by r.created_at)
                       from public.argument_replies r join public.profiles rp on rp.id = r.author_id where r.argument_id = a.id and r.hidden_at is null), '[]') as replies
      from public.arguments a join public.profiles p on p.id = a.author_id
      where a.initiative_id = ${id} and a.hidden_at is null`;
    const posts = active === "threads" ? await loadPosts(tx, { initiativeId: id }, me ?? null, { sort: "top" }) : [];
    const requests = await tx<{ id: string; status: string; decision: string | null; response_body: string | null; responded_at: string | null; due_at: string; title: string; org: string | null; official: boolean }[]>`
      select q.id, q.status::text, q.decision::text, q.response_body, q.responded_at, q.due_at, s.title, s.organization_name as org, s.is_official as official
      from public.responsibility_requests q join public.responsibilities s on s.id = q.responsibility_id
      where q.initiative_id = ${id} order by q.created_at desc`;
    const revisions = active === "history" ? await tx<{ id: string; created_at: string; note: string | null; editor: string | null; snapshot: Record<string, string | null> }[]>`
      select v.id, v.created_at, v.note, p.display_name as editor, v.snapshot from public.initiative_revisions v
      left join public.profiles p on p.id = v.editor_id where v.initiative_id = ${id} order by v.created_at desc limit 30` : [];
    const tasks = ini.group_slug && active === "implementation" ? await tx<{ title: string; status: string }[]>`
      select tk.title, tk.status::text from public.tasks tk join public.groups g on g.id = tk.group_id where g.slug = ${ini.group_slug} order by tk.position` : [];
    const isAuthorNow = me ? authors.some((a) => a.id === me) : false;
    const [{ needed, debate_pending, debate_until }] = await tx<{ needed: number; debate_pending: boolean; debate_until: Date | null }[]>`
      select app.support_threshold(${ini.region_id}) as needed,
             (i.published_at is null or now() < i.published_at + make_interval(days => app.param('debate_min_days'))) as debate_pending,
             i.published_at + make_interval(days => app.param('debate_min_days')) as debate_until
      from public.initiatives i where i.id = ${id}`;
    const [{ max }] = await tx<{ max: number }[]>`select app.param('authors_max') as max`;
    const invites = isAuthorNow ? await tx<{ id: string; name: string }[]>`
      select v.id, p.display_name as name from public.initiative_author_invites v join public.profiles p on p.id = v.profile_id
      where v.initiative_id = ${id} and v.status = 'pending' order by v.created_at` : [];
    const myInvite = me && !isAuthorNow ? (await tx<{ id: string; by: string | null }[]>`
      select v.id, p.display_name as by from public.initiative_author_invites v left join public.profiles p on p.id = v.invited_by
      where v.initiative_id = ${id} and v.profile_id = ${me} and v.status = 'pending' limit 1`)[0] ?? null : null;
    const removals = isAuthorNow ? await tx<RemovalRow[]>`
      select r.id, r.subject_id, sp.display_name as subject_name,
             (select count(*)::int from public.initiative_removal_votes v where v.removal_id = r.id and v.yes) as yes,
             (select count(*)::int from public.initiative_removal_votes v where v.removal_id = r.id and not v.yes) as no,
             (select v.yes from public.initiative_removal_votes v where v.removal_id = r.id and v.voter_id = ${me ?? null}) as mine
      from public.initiative_removals r join public.profiles sp on sp.id = r.subject_id
      where r.initiative_id = ${id} and r.status = 'open' order by r.created_at` : [];
    const adminGroups = isAuthorNow && me ? await tx<{ id: string; name: string }[]>`
      select g.id, g.name from public.group_members m join public.groups g on g.id = m.group_id
      where m.profile_id = ${me} and m.role = 'admin' and g.archived_at is null order by g.name limit 30` : [];
    const [{ deletable }] = await tx<{ deletable: boolean }[]>`
      select not (
        exists (select 1 from public.initiative_supports s where s.initiative_id = ${id} and not exists (select 1 from public.initiative_authors a where a.initiative_id = ${id} and a.profile_id = s.profile_id))
        or exists (select 1 from public.ballots b where b.initiative_id = ${id})
        or exists (select 1 from public.arguments x where x.initiative_id = ${id} and not exists (select 1 from public.initiative_authors a where a.initiative_id = ${id} and a.profile_id = x.author_id))
        or exists (select 1 from public.posts x where x.initiative_id = ${id} and not exists (select 1 from public.initiative_authors a where a.initiative_id = ${id} and a.profile_id = x.author_id))) as deletable`;
    const [{ frozen }] = await tx<{ frozen: boolean }[]>`select app.initiative_frozen(${id}) as frozen`;
    const similar = await tx<{ id: string; title: string; region_name: string; phase: string }[]>`
      select i2.id, i2.title, r.name as region_name, i2.phase::text from public.initiatives i2 join public.regions r on r.id = i2.region_id
      where i2.id <> ${id} and i2.published_at is not null and i2.region_id <> ${ini.region_id}
        and exists (select 1 from public.initiative_tags a join public.initiative_tags b on a.tag_id = b.tag_id
                    where a.initiative_id = i2.id and b.initiative_id = ${id})
      order by i2.support_count desc limit 2`;
    return { ini, authors, tags, supported, ballot, participation, turnout, affected, args, posts, requests, revisions, tasks, similar, needed, debate_pending, debate_until, max, invites, myInvite, removals, adminGroups, deletable, frozen };
  });
  if (!data) notFound();
  const { ini, authors, ballot } = data;
  const isAuthor = !!me && authors.some((a) => a.id === me);
  const signedIn = !!session;
  const canWrite = !!session?.profile.verified;
  const topPro = data.args.filter((a) => a.side === "pro").sort((a, b) => b.bridge_score - a.bridge_score).slice(0, 2).map((a) => a.body);
  const topContra = data.args.filter((a) => a.side === "contra").sort((a, b) => b.bridge_score - a.bridge_score).slice(0, 2).map((a) => a.body);
  const ballotOpen = ballot?.status === "open";

  const milestone = ini.outcome ? null
    : ballotOpen ? t("milestone.vote", { days: daysUntil(ballot!.closes_at) })
    : ini.phase === "idea" ? t("milestone.idea")
    : ini.phase === "debate" ? t("milestone.debate", { n: data.args.length })
    : ini.phase === "addressee" ? t("milestone.addressee", { date: ini.response_due_at ? dateLong(ini.response_due_at, locale) : "–" })
    : ini.phase === "implementation" ? t("milestone.implementation", { done: data.tasks.filter((x) => x.status === "done").length, total: data.tasks.length })
    : t("milestone.done");

  const answered = data.requests.find((r) => r.status === "answered");
  const addressee = ini.resp_title ? [ini.resp_org, ini.resp_title].filter(Boolean).join(" · ") : ini.addressee_text;
  const tabLabel = (k: (typeof TABS)[number]) =>
    k === "threads" ? t("tabs.threadsN", { n: ini.thread_count }) : k === "arguments" ? t("tabs.argumentsN", { n: data.args.length }) : t(`tabs.${k}`);

  return (
    <div className="grid gap-5 px-4 pb-6 pt-4 md:gap-10 md:px-10 md:pb-20 md:pt-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <nav aria-label={t("breadcrumb")} className="flex gap-2 text-sm">
          <Link href="/explore" className="text-ink">{t("explore")}</Link><span aria-hidden="true">/</span><span>{ini.region_name}</span>
        </nav>
        <Cover seed={ini.cover_seed} src={ini.cover_path} ratio="21 / 9" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex h-8 items-center bg-ink px-3 font-bold text-on-ink">{ini.region_name} · {tl(ini.region_level as "municipality")}</span>
          {data.tags.map((x) => <Link key={x.slug} href={`/explore?q=${x.slug}`} className={`${tag} text-ink no-underline`}>#{x.slug}</Link>)}
        </div>
        <h1 className="display m-0 max-w-[960px]">{ini.title}</h1>
        <div className="flex flex-col gap-1 text-sm">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t("by")}
            {authors.map((a) => (
              <Link key={a.id} href={`/profile/${a.id}`} className="inline-flex items-center gap-1.5 font-bold text-ink no-underline">
                <Avatar name={a.display_name} seed={a.avatar_seed} path={a.avatar_path} size={28} /> {a.display_name}
                {a.display_mode === "real" && <span aria-label={t("verified")}><IconCheck size={12} /></span>}
              </Link>
            ))}
          </span>
          <span className="text-muted">{t("dates", { created: dateLong(ini.created_at, locale), updated: dateLong(ini.updated_at, locale) })}</span>
        </div>
        {data.myInvite && <AuthorInviteBanner id={id} inviteId={data.myInvite.id} by={data.myInvite.by ?? "?"} title={ini.title} />}
        {ini.blocked_at && (
          <div role="status" className="flex max-w-[720px] flex-col gap-1 border-l-4 border-red bg-surface p-4">
            <strong>{tr("banner.blocked", { reason: ini.blocked_reason ?? "" })}</strong>
            <span className="text-sm">{tr("banner.blockedText")}</span>
          </div>
        )}
        {ini.withdrawn_at && (
          <div role="status" className="flex max-w-[720px] flex-col gap-1 border-l-4 border-ink bg-surface p-4">
            <strong>{tr("banner.withdrawn", { date: dateLong(ini.withdrawn_at, locale) })}</strong>
            {ini.withdrawn_note && <span className="text-sm">{tr("banner.withdrawnNote", { note: ini.withdrawn_note })}</span>}
          </div>
        )}
        <div className="max-w-[720px]"><PhaseRail phase={ini.phase} outcome={ini.outcome} /></div>
        {milestone && <p className="m-0 text-xl font-bold leading-snug">{milestone}</p>}
        {answered && (
          <section aria-label={t("officialAnswer")} className="flex max-w-[720px] gap-4 border-2 border-ink bg-surface p-5">
            <Glyph shape="arch" size={56} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[13px] font-bold">{t("answerFrom", { who: [answered.org, answered.title].filter(Boolean).join(" · "), date: dateLong(answered.responded_at!, locale) })}</span>
              <strong className="text-2xl leading-tight">{t(`decision.${answered.decision}`)}</strong>
              <p className="m-0">{answered.response_body}</p>
            </div>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-4">
          {!ini.outcome && !ini.blocked_at && (ini.phase === "idea" || ini.phase === "debate") && !ballotOpen && <SupportButton id={id} supported={data.supported} signedIn={signedIn} />}
          {ballotOpen && <Link href={`${path}?tab=vote`} className="inline-flex h-[52px] items-center bg-ink px-6 font-bold text-on-ink no-underline">{t("voteNow")}</Link>}
          {ini.phase === "implementation" && ini.group_slug && <Link href={`/groups/${ini.group_slug}`} className="inline-flex h-[52px] items-center bg-ink px-6 font-bold text-on-ink no-underline">{t("help")}</Link>}
          <span className="tabular">{t("supports", { n: ini.support_count, formatted: num(ini.support_count, locale) })}</span>
        </div>
        <ShareBlock path={path} title={ini.title} isPublic={!!ini.published_at && !ini.blocked_at} />
        {signedIn && !isAuthor && !ini.outcome && <WhyNot action="initiative.edit" objectId={id} />}
        {isAuthor && !ini.blocked_at && (
          <AuthorTools id={id} phase={ini.phase} outcome={ini.outcome} hasBallot={ballotOpen} hasGroup={!!ini.group_slug} title={ini.title}
            isLead={ini.lead_id === me} supports={ini.support_count} needed={data.needed} debateUntil={data.debate_pending && data.debate_until ? dateLong(data.debate_until, locale) : null}
            frozen={data.frozen} deletable={data.deletable} />
        )}
        {isAuthor && !ini.outcome && (
          <CoAuthors id={id} authors={authors.map((a): AuthorRow => ({ id: a.id, name: a.display_name, seed: a.avatar_seed, path: a.avatar_path }))} leadId={ini.lead_id} me={me!}
            invites={data.invites as PendingInvite[]} removals={data.removals} max={data.max} groups={data.adminGroups} groupId={ini.group_id} />
        )}
        {session?.profile.is_admin && <BlockInitiative id={id} blocked={!!ini.blocked_at} />}

        <div role="tablist" aria-label={t("sections")} className="flex overflow-x-auto border-b border-line">
          {TABS.map((k) => (
            <Link key={k} role="tab" aria-selected={active === k} href={`${path}${k === "about" ? "" : `?tab=${k}`}`} scroll={false} className={tab(active === k)}>{tabLabel(k)}</Link>
          ))}
        </div>

        {active === "about" && (
          <section className="flex max-w-[720px] flex-col gap-4">
            {ini.body_easy && (
              <Link href={easy ? path : `${path}?easy=1`} scroll={false} className="inline-flex items-center gap-2 self-start text-sm text-ink no-underline" aria-pressed={easy}>
                <span className={`inline-flex h-5 w-5 items-center justify-center border border-ink ${easy ? "bg-ink text-on-ink" : ""}`}>{easy && <IconCheck size={12} />}</span>
                {t("easyLanguage")}
              </Link>
            )}
            {ini.summary && !easy && <p className="m-0 text-xl leading-snug">{ini.summary}</p>}
            <div className="flex flex-col gap-3 whitespace-pre-line text-lg leading-relaxed">
              {(easy ? ini.body_easy : ini.body) ?? <span className="text-muted">{t("noBody")}</span>}
            </div>
          </section>
        )}

        {active === "threads" && (
          <section className="flex max-w-[760px] flex-col gap-4">
            {canWrite
              ? <Composer ctx={{ initiativeId: id }} path={path} placeholder={t("threadPlaceholder")} viewerName={session!.profile.display_name} viewerSeed={session!.profile.avatar_seed} viewerPath={session!.profile.avatar_path} />
              : <p className="m-0 text-muted"><Link href={`/login?next=${path}`}>{t("signInToJoin")}</Link></p>}
            <PostList posts={data.posts} path={`${path}?tab=threads`} canWrite={canWrite} viewerId={me} empty={t("noThreads")} />
          </section>
        )}

        {active === "arguments" && <ArgumentBoard initiativeId={id} args={data.args} canWrite={canWrite} viewerId={me} />}

        {active === "vote" && (
          ballot ? (
            <BallotPanel ballot={ballot} voted={!!data.participation} segment={signedIn ? (data.participation?.segment ?? (data.affected ? "affected" : "external")) : null}
              turnout={data.turnout} signedIn={signedIn} canVote={canWrite} path={`${path}?tab=vote`} pro={topPro} contra={topContra} />
          ) : (
            <section className="flex max-w-[720px] flex-col gap-2">
              <strong className="text-xl">{t(ini.phase === "idea" ? "noVoteIdea" : "noVoteYet")}</strong>
              <span>{t("whoVotes", { place: ini.region_name })}</span>
            </section>
          )
        )}

        {active === "implementation" && (
          <section className="flex max-w-[760px] flex-col gap-6">
            {data.requests.length === 0 && data.tasks.length === 0 && (
              <div className="flex flex-col gap-2"><strong className="text-xl">{t("nothingYet")}</strong><span>{t("nothingYetText")}</span></div>
            )}
            {data.requests.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-sm font-bold">{[r.org, r.title].filter(Boolean).join(" · ")} · {t(`requestStatus.${r.status}`)}</span>
                {r.response_body ? <p className="m-0">{r.response_body}</p> : <span className="text-sm text-muted">{t("dueBy", { date: dateLong(r.due_at, locale) })}</span>}
              </div>
            ))}
            {data.tasks.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="m-0 text-xl font-bold">{t("tasks", { done: data.tasks.filter((x) => x.status === "done").length, total: data.tasks.length })}</h2>
                <ul className="m-0 flex list-none flex-col p-0">
                  {data.tasks.map((x) => (
                    <li key={x.title} className="flex items-center gap-3 border-b border-line py-2">
                      <span aria-hidden="true" className={`h-3.5 w-3.5 flex-none ${x.status === "done" ? "bg-ink" : "border border-ink"}`} />
                      <span className={x.status === "done" ? "line-through" : ""}>{x.title}</span>
                    </li>
                  ))}
                </ul>
                {ini.group_slug && <Link href={`/groups/${ini.group_slug}?tab=tasks`} className="font-bold">{t("toGroup")}</Link>}
              </div>
            )}
          </section>
        )}

        {active === "history" && (
          <section className="flex max-w-[760px] flex-col">
            {data.revisions.map((v, i) => {
              const prev = data.revisions[i + 1]?.snapshot;
              const changed = prev ? Object.keys(v.snapshot).filter((k) => v.snapshot[k] !== prev[k]) : [];
              return (
                <div key={v.id} className="flex flex-col gap-1.5 border-b border-line py-4">
                  <span className="text-sm text-muted">{t("version", { n: data.revisions.length - i })} · {dateLong(v.created_at, locale)} · {v.editor ?? "–"}</span>
                  <span className="font-bold">{v.note === "created" ? t("created") : changed.length ? t("changed", { fields: changed.map((k) => t(`fields.${k}`)).join(", ") }) : t("noChange")}</span>
                  {v.note && v.note !== "created" && <span className="text-sm">{v.note.startsWith("correction: ") ? tr("history.correction", { note: v.note.slice(12) }) : tr("history.note", { note: v.note })}</span>}
                  {changed.filter((k) => k !== "body" && k !== "body_easy").map((k) => (
                    <div key={k} className="flex flex-col gap-0.5 text-sm">
                      <span className="text-muted line-through">− {String(prev![k] ?? "–")}</span>
                      <span>+ {String(v.snapshot[k] ?? "–")}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}
      </div>

      <aside aria-label={t("context")} className="flex flex-col gap-6 xl:pt-[calc(21/9*0px)]">
        <div className="flex flex-col gap-1.5 border-t-[6px] border-ink pt-3">
          <span className="text-sm font-bold">{t("addressee")}</span>
          {addressee ? (
            ini.resp_id
              ? <Link href={`/responsible?id=${ini.resp_id}`} className="flex items-center gap-1.5 text-lg font-bold text-ink no-underline">{addressee}{ini.resp_official && <IconCheck />}</Link>
              : <strong className="text-lg">{addressee}</strong>
          ) : <span className="text-muted">{t("noAddressee")}</span>}
          <span className="text-sm">{ini.phase === "idea" || ini.phase === "debate" ? t("addresseeLater") : ini.resp_days ? t("respondsIn", { days: ini.resp_days }) : ""}</span>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-sm font-bold">{t("costs")}</span>
          <strong className="text-lg">{ini.cost_estimate_cents ? t("about", { amount: euro(ini.cost_estimate_cents, locale) }) : "–"}</strong>
          <span className="text-sm">{t("costsNote")}</span>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-sm font-bold">{t("workingGroup")}</span>
          {ini.group_slug ? <Link href={`/groups/${ini.group_slug}`} className="font-bold text-ink">{ini.group_name}</Link> : <span className="text-sm">{t("noGroup")}</span>}
        </div>
        {data.similar.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            <span className="text-sm font-bold">{t("elsewhere")}</span>
            {data.similar.map((s) => (
              <Link key={s.id} href={`/initiatives/${s.id}`} className="text-sm text-ink">
                <strong>{s.title}</strong> · {s.region_name}
              </Link>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
