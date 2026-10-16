import { ChatScroll } from "@/components/ChatScroll";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer, sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts } from "@/lib/posts";
import { listingCardColumns, listingCardFrom, type ListingCard } from "@/lib/queries";
import { Cover } from "@/components/ui/Cover";
import { Avatar } from "@/components/ui/Avatar";
import { tab, tag } from "@/components/ui/styles";
import { JoinPanel } from "@/components/group/JoinPanel";
import { Goals, type GoalView } from "@/components/group/Goals";
import { Tasks, type TaskView } from "@/components/group/Tasks";
import { Team } from "@/components/group/Team";
import { Composer, PostList } from "@/components/PostList";
import { ContactButton } from "@/components/listings/ContactButton";
import { priceLabel } from "@/components/listings/price";
import { FollowButton } from "@/components/FollowButton";
import { LinkCard } from "@/components/links/LinkCard";
import { resourceColumns, resourceFrom, type ResourceRow } from "@/lib/links/queries";
import { btn } from "@/components/ui/styles";

const TABS = ["goals", "talk", "links", "needs", "tasks", "team", "about"] as const;

type Group = {
  id: string; slug: string; name: string; summary: string | null; description: string | null; kind: string; visibility: string;
  join_policy: "open" | "request"; member_count: number; cover_seed: number; cover_path: string | null; mod_tasks: boolean; region_name: string | null; created_at: string;
};

export async function generateMetadata({ params }: PageProps<"/groups/[slug]">) {
  const { slug } = await params;
  const [g] = await asViewer(null, (tx) => tx<{ name: string; summary: string | null }[]>`select name, summary from public.groups where slug = ${slug}`);
  return g ? { title: g.name, description: g.summary ?? undefined } : {};
}

export default async function GroupPage({ params, searchParams }: PageProps<"/groups/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("group");
  const tc = await getTranslations("common");
  const tl = await getTranslations("links");
  const locale = await getLocale();
  await sql`select app.tick()`;

  const data = await asViewer(viewer, async (tx) => {
    const [g] = await tx<Group[]>`
      select g.id, g.slug::text, g.name, g.summary, g.description, g.kind::text, g.visibility::text, g.join_policy::text, g.member_count,
             g.cover_seed, g.cover_path, g.mod_tasks, g.created_at, r.name as region_name
      from public.groups g left join public.regions r on r.id = g.region_id where g.slug = ${slug}`;
    if (!g) return null;
    const [{ role, can_post, can_propose, can_vote, can_tasks, can_manage }] = await tx<{ role: string | null; can_post: boolean; can_propose: boolean; can_vote: boolean; can_tasks: boolean; can_manage: boolean }[]>`
      select app.group_role(${g.id})::text as role, app.has_group_permission(${g.id}, 'post') as can_post,
             app.has_group_permission(${g.id}, 'propose_goals') as can_propose, app.has_group_permission(${g.id}, 'vote_goals') as can_vote,
             app.has_group_permission(${g.id}, 'edit_tasks') as can_tasks, app.has_group_permission(${g.id}, 'manage_members') as can_manage`;
    const members = await tx<{ id: string; name: string; seed: number; path: string | null; role: string; focus: string | null }[]>`
      select p.id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path, m.role::text, m.focus from public.group_members m join public.profiles p on p.id = m.profile_id
      where m.group_id = ${g.id} order by array_position(array['admin','maintainer','contributor','guest'], m.role::text), p.display_name`;
    const tags = await tx<{ slug: string }[]>`select t.slug::text from public.group_tags gt join public.tags t on t.id = gt.tag_id where gt.group_id = ${g.id}`;
    const requested = me ? (await tx`select 1 from public.group_join_requests where group_id = ${g.id} and profile_id = ${me} and status = 'pending'`).length > 0 : false;
    const following = me ? (await tx`select 1 from public.follows where follower_id = ${me} and target_type = 'group' and target_id = ${g.id}`).length > 0 : false;
    const goalsRaw = await tx<(Omit<GoalView, "ballot"> & { ballot_id: string | null })[]>`
      select go.id, go.title, go.description, go.status::text, go.timeline, go.adopted_at, pp.display_name as proposed_by_name,
        coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'seed', p.avatar_seed)) from public.goal_owners o join public.profiles p on p.id = o.profile_id where o.goal_id = go.id), '[]') as owners,
        coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'done', s.done) order by s.position) from public.goals s where s.parent_goal_id = go.id), '[]') as subs,
        coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title)) from public.listings l where l.goal_id = go.id and l.status = 'active'), '[]') as needs,
        (select b.id from public.ballots b where b.goal_id = go.id order by b.created_at desc limit 1) as ballot_id
      from public.goals go left join public.profiles pp on pp.id = go.proposed_by
      where go.group_id = ${g.id} and go.parent_goal_id is null
      order by (go.status = 'voting') desc, go.created_at`;
    const goals: GoalView[] = [];
    for (const go of goalsRaw) {
      let ballot: GoalView["ballot"] = null;
      if (go.ballot_id) {
        const [b] = await tx<NonNullable<GoalView["ballot"]>[]>`
          select b.id, b.question, b.status::text, b.closes_at, b.quorum_pct, b.subject_type::text, b.result,
                 ${me ? tx`exists (select 1 from public.ballot_participation x where x.ballot_id = b.id and x.profile_id = ${me})` : tx`false`} as voted,
                 app.ballot_turnout(b.id) as turnout
          from public.ballots b where b.id = ${go.ballot_id}`;
        ballot = b ?? null;
      }
      goals.push({ ...go, ballot });
    }
    const active = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as (typeof TABS)[number]) : "goals";
    const links = active === "links" ? await tx<ResourceRow[]>`select ${resourceColumns(tx, me ?? null)} from ${resourceFrom(tx)} where r.group_id = ${g.id} and r.hidden_at is null order by r.score desc, r.created_at desc limit 100` : [];
    const posts = active === "talk" ? await loadPosts(tx, { groupId: g.id }, me ?? null, { sort: "chat", limit: 60 }) : [];
    const needs = await tx<ListingCard[]>`select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where l.group_id = ${g.id} and l.kind = 'need' and l.status = 'active' order by l.created_at desc`;
    const sentTo = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.contact_requests where from_profile_id = ${me} and status = 'pending'`).map((x) => x.listing_id) : [];
    const tasks = active === "tasks" ? await tx<TaskView[]>`
      select tk.id, tk.title, tk.status::text, tk.hourly_rate_cents,
        coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'seed', p.avatar_seed)) from public.task_assignees a join public.profiles p on p.id = a.profile_id where a.task_id = tk.id), '[]') as assignees
      from public.tasks tk where tk.group_id = ${g.id} order by tk.position, tk.created_at` : [];
    const requests = active === "team" && can_manage ? await tx<{ id: string; profile_id: string; name: string; seed: number; path: string | null; message: string | null }[]>`
      select r.id, r.profile_id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path, r.message from public.group_join_requests r join public.profiles p on p.id = r.profile_id
      where r.group_id = ${g.id} and r.status = 'pending' order by r.created_at` : [];
    const permRows = active === "team" ? await tx<{ holder: string; permission: string; allowed: boolean }[]>`
      select holder::text, permission::text, allowed from public.group_role_permissions where group_id = ${g.id}` : [];
    const perms: Record<string, Record<string, boolean>> = {};
    for (const p of permRows) (perms[p.holder] ??= {})[p.permission] = p.allowed;
    const similar = await tx<{ slug: string; name: string; member_count: number }[]>`
      select g2.slug::text, g2.name, g2.member_count from public.groups g2
      where g2.id <> ${g.id} and g2.archived_at is null and exists (
        select 1 from public.group_tags a join public.group_tags b on a.tag_id = b.tag_id where a.group_id = g2.id and b.group_id = ${g.id})
      order by g2.member_count desc limit 3`;
    return { g, role, can_post, can_propose, can_vote, can_tasks, can_manage, members, tags, requested, following, goals, posts, links, needs, sentTo, tasks, requests, perms, similar, active };
  });
  if (!data) notFound();
  const { g, role, active } = data;
  const path = `/groups/${slug}`;
  const voting = data.goals.filter((x) => x.status === "voting").length;
  const admins = data.members.filter((m) => m.role === "admin");
  const labels: Record<(typeof TABS)[number], string> = {
    goals: voting ? t("tabs.goalsVoting", { n: voting }) : t("tabs.goals"),
    talk: t("tabs.talk"),
    links: t("tabs.links"),
    needs: t("tabs.needs", { n: data.needs.length }),
    tasks: t("tabs.tasks"),
    team: t("tabs.team"),
    about: t("tabs.about"),
  };
  const tabs = TABS.filter((k) => k !== "tasks" || g.mod_tasks);

  return (
    <div className="grid gap-10 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-10 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        <nav aria-label={t("breadcrumb")} className="flex gap-2 text-sm">
          <Link href="/groups" className="text-ink">{t("groups")}</Link><span aria-hidden="true">/</span><span>{g.name}</span>
        </nav>
        <Cover seed={g.cover_seed} src={g.cover_path} ratio="21 / 9" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex h-8 items-center bg-ink px-3 font-bold text-on-ink">{t(`kinds.${g.kind}`)}</span>
          {g.region_name && <span className={tag}>{g.region_name}</span>}
          <span className={tag}>{t(`policy.${g.join_policy}`)}</span>
          {g.visibility === "members" && <span className={tag}>{t("vis.members")}</span>}
          {data.tags.map((x) => <span key={x.slug} className={tag}>#{x.slug}</span>)}
        </div>
        <h1 className="display m-0">{g.name}</h1>
        {g.summary && <p className="m-0 max-w-[720px] text-xl">{g.summary}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            {admins.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} seed={a.seed} size={28} />)}
            {t("memberCount", { n: g.member_count })}
          </span>
          {session && <FollowButton type="group" id={g.id} following={data.following} />}
        </div>
        <JoinPanel slug={slug} id={g.id} policy={g.join_policy} role={role} requested={data.requested} signedIn={!!session}
          lastAdmin={role === "admin" && admins.length === 1} />

        <div role="tablist" aria-label={t("sections")} className="flex overflow-x-auto border-b border-line">
          {tabs.map((k) => (
            <Link key={k} role="tab" aria-selected={active === k} href={`${path}${k === "goals" ? "" : `?tab=${k}`}`} scroll={false} className={tab(active === k)}>{labels[k]}</Link>
          ))}
        </div>

        {active === "goals" && (
          <Goals slug={slug} groupId={g.id} goals={data.goals} members={data.members.map((m) => ({ id: m.id, name: m.name }))}
            canPropose={data.can_propose} canEdit={role === "admin" || role === "maintainer"} canVote={data.can_vote} isMember={!!role && role !== "guest"} signedIn={!!session} />
        )}
        {active === "talk" && (
          <section className="flex max-w-[760px] flex-col gap-3">
            <ChatScroll count={data.posts.length} className="flex max-h-[60dvh] min-h-[240px] flex-col overflow-y-auto border border-line bg-surface px-4">
              <PostList posts={data.posts} path={`${path}?tab=talk`} canWrite={data.can_post} viewerId={me} empty={t("noPosts")} />
            </ChatScroll>
            {data.can_post
              ? <Composer ctx={{ groupId: g.id }} path={`${path}?tab=talk`} placeholder={t("talkPlaceholder", { name: g.name })} viewerName={session?.profile.display_name} viewerSeed={session?.profile.avatar_seed} viewerPath={session?.profile.avatar_path} />
              : <p className="m-0 text-muted">{session ? t("joinToPost") : tc("signInToWrite")}</p>}
          </section>
        )}
        {active === "links" && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 max-w-[640px]">{tl("groupIntro")}</p>
              {data.can_post
                ? <Link href={`/new/link?group=${slug}`} className={btn.primary}>+ {tl("groupShare")}</Link>
                : <span className="text-sm text-muted">{session ? t("joinToPost") : tc("signInToWrite")}</span>}
            </div>
            {data.links.length === 0 && <p className="m-0 text-muted">{tl("empty")}</p>}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {data.links.map((r) => <LinkCard key={r.id} r={r} me={me ?? null} canVote={!!session?.profile.verified} />)}
            </div>
          </section>
        )}
        {active === "needs" && (
          <section className="flex flex-col gap-4">
            <p className="m-0 max-w-[640px]">{t("needsIntro")}</p>
            {data.needs.length === 0 && <p className="m-0 text-muted">{t("noNeeds")}</p>}
            <div className="flex flex-col border-t border-line">
              {data.needs.map((n) => (
                <div key={n.id} className="flex flex-wrap items-center gap-4 border-b border-line py-4">
                  <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                    <Link href={`/needs/${n.id}`} className="font-bold text-ink no-underline">#{t("needsTag")} {n.title}</Link>
                    {n.description && <span className="text-sm">{n.description}</span>}
                    <span className="text-sm text-muted">{[n.goal_title ? t("forGoal", { goal: n.goal_title }) : null, priceLabel(n, tc, locale)].filter(Boolean).join(" · ")}</span>
                  </div>
                  {n.owner_id !== me && (
                    <ContactButton listingId={n.id} ownerName={n.owner_name} ownerSeed={n.owner_seed} title={n.title} price={priceLabel(n, tc, locale)}
                      label={t("canHelp")} signedIn={!!session} sent={data.sentTo.includes(n.id)} />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {active === "tasks" && <Tasks slug={slug} groupId={g.id} tasks={data.tasks} canEdit={data.can_tasks} viewerId={me} />}
        {active === "team" && (
          <Team slug={slug} groupId={g.id} visibility={g.visibility} joinPolicy={g.join_policy} members={data.members} requests={data.requests}
            perms={data.perms} myRole={role} canManage={data.can_manage} viewerId={me} />
        )}
        {active === "about" && (
          <section className="flex max-w-[720px] flex-col gap-4">
            <p className="m-0 whitespace-pre-line text-lg leading-relaxed">{g.description ?? g.summary ?? t("noDescription")}</p>
            <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-t border-line pt-4">
              <dt className="font-bold">{t("kind")}</dt><dd className="m-0">{t(`kinds.${g.kind}`)}</dd>
              <dt className="font-bold">{t("team")}</dt><dd className="m-0">{t("memberCount", { n: g.member_count })}</dd>
              <dt className="font-bold">{t("founded")}</dt><dd className="m-0">{new Date(g.created_at).toLocaleDateString(locale)}</dd>
            </dl>
          </section>
        )}
      </div>
      <aside className="flex flex-col gap-6">
        {data.needs.length > 0 && (
          <section className="flex flex-col gap-2 border-t-[6px] border-ink pt-3">
            <h2 className="m-0 text-lg font-bold">{t("needsAside")}</h2>
            {data.needs.slice(0, 5).map((n) => <Link key={n.id} href={`${path}?tab=needs`} className="text-sm text-ink">#{n.title}</Link>)}
          </section>
        )}
        {data.similar.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-line pt-3">
            <h2 className="m-0 text-lg font-bold">{t("similar")}</h2>
            {data.similar.map((s) => (
              <Link key={s.slug} href={`/groups/${s.slug}`} className="flex items-center gap-2 text-sm text-ink no-underline">
                <Avatar name={s.name} size={28} group /> <span><strong>{s.name}</strong> · {t("memberCount", { n: s.member_count })}</span>
              </Link>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}
