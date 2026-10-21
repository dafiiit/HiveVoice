import { ChatScroll } from "@/components/ChatScroll";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer, sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts } from "@/lib/posts";
import { listingCardColumns, listingCardFrom, type ListingCard } from "@/lib/queries";
import { Cover } from "@/components/ui/Cover";
import { Avatar } from "@/components/ui/Avatar";
import { asideBlock, tag } from "@/components/ui/styles";
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
import { Invites } from "@/components/group/Invites";
import { Leadership, type MotionView, type TransferView } from "@/components/group/Leadership";
import { GroupRules } from "@/components/group/GroupRules";
import { DangerZone } from "@/components/group/DangerZone";
import { GroupTools } from "@/components/group/GroupTools";
import { GROUP_TOOLS, type GroupTool } from "@/lib/group-tools";
import { InviteBanner } from "@/components/group/InviteBanner";
import { ShareBlock } from "@/components/ShareBlock";
import { Collection, type CollectionItem } from "@/components/refs/Collection";
import { loadRefCards, type RefCard } from "@/lib/refs";
import { BackLink, Notice, Page, Section, Tabs } from "@/components/ui/Page";
import { dateLong, dateTime } from "@/lib/format";

const TABS = ["goals", "talk", "links", "collection", "needs", "tasks", "team", "about"] as const;

type Group = {
  id: string; slug: string; name: string; summary: string | null; description: string | null; kind: string; visibility: string;
  join_policy: "open" | "request" | "invite"; member_count: number; cover_seed: number; cover_path: string | null; mod_tasks: boolean; region_name: string | null; created_at: string;
  owner_id: string | null; owner_name: string | null; orphaned_at: string | null; delete_requested_at: string | null; archived_at: string | null;
  slow_mode_seconds: number; adults_only: boolean; admins_manage_initiatives: boolean; can_takeover: boolean; tools: GroupTool[];
};

export async function generateMetadata({ params }: PageProps<"/groups/[slug]">) {
  const { slug } = await params;
  const [g] = await asViewer(null, (tx) => tx<{ name: string; summary: string | null }[]>`select name, summary from public.groups where slug = ${slug}`);
  return g ? { title: g.name, description: g.summary ?? undefined } : {};
}

const qs = (sp: Record<string, string | string[] | undefined>) => {
  const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
  return p.size ? `?${p}` : "";
};

/** A group opens in its area: my groups in Freunde, the others in Gemeinschaft, each next to its list. */
export default async function GroupPage({ params, searchParams }: PageProps<"/groups/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const [g] = await asViewer(session ? { authId: session.authId, profileId: session.profile.id } : null, (tx) =>
    tx<{ member: boolean }[]>`select app.group_role(g.id) is not null as member from public.groups g where g.slug = ${slug}`);
  if (!g) notFound();
  redirect(`${g.member ? "/friends/g" : "/community/groups"}/${slug}${qs(sp)}`);
}

/**
 * One group. `base`: the address its tabs build on (in Freunde /friends/g/…, in Gemeinschaft /community/groups/…);
 * `embedded`: next to a list, side column below the content, no back link; `first`: the tab it opens with.
 * `bare`: only the content of the chosen tab (`sp.tab`), for the tools of a private chat, whose tabs sit in the chat.
 */
export async function GroupView({ slug, sp, base, embedded = false, first: firstTab, bare = false }: { slug: string; sp: Record<string, string | string[] | undefined>; base: string; embedded?: boolean; first?: "talk"; bare?: boolean }) {
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("group");
  const tr = await getTranslations("grouprights");
  const tc = await getTranslations("common");
  const tl = await getTranslations("links");
  const trf = await getTranslations("refs");
  const locale = await getLocale();
  await sql`select app.tick()`;

  const data = await asViewer(viewer, async (tx) => {
    const [g] = await tx<Group[]>`
      select g.id, g.slug::text, g.name, g.summary, g.description, g.kind::text, g.visibility::text, g.join_policy::text, g.member_count,
             g.cover_seed, g.cover_path, g.mod_tasks, g.created_at, r.name as region_name,
             g.owner_id, op.display_name as owner_name, g.orphaned_at, g.delete_requested_at, g.archived_at, g.slow_mode_seconds, g.adults_only, g.admins_manage_initiatives, g.tools,
             (g.orphaned_at is not null or g.owner_id is null or app.last_activity(g.owner_id) < now() - interval '30 days') as can_takeover
      from public.groups g left join public.regions r on r.id = g.region_id left join public.profiles op on op.id = g.owner_id where g.slug = ${slug}`;
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
    // Only the tools the admins switched on have a tab; chat, members and the about page are always there.
    const on = (k: (typeof TABS)[number]) => !(GROUP_TOOLS as readonly string[]).includes(k) || g.tools.includes(k as GroupTool);
    const first = firstTab ?? (g.tools.includes("goals") ? "goals" : "talk");
    const active = (TABS as readonly string[]).includes(String(sp.tab)) && on(sp.tab as (typeof TABS)[number]) ? (sp.tab as (typeof TABS)[number]) : first;
    const links = active === "links" ? await tx<ResourceRow[]>`select ${resourceColumns(tx, me ?? null)} from ${resourceFrom(tx)} where r.group_id = ${g.id} and r.hidden_at is null and r.trashed_at is null and r.visibility in ('public', 'group') order by r.score desc, r.created_at desc limit 100` : [];
    const posts = active === "talk" ? await loadPosts(tx, { groupId: g.id }, me ?? null, { sort: "chat", limit: 60 }) : [];
    const needs = await tx<ListingCard[]>`select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where l.group_id = ${g.id} and l.kind = 'need' and l.status = 'active' order by l.created_at desc`;
    const sentTo = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.contact_requests where from_profile_id = ${me} and status = 'pending'`).map((x) => x.listing_id) : [];
    const tasks = active === "tasks" ? await tx<TaskView[]>`
      select tk.id, tk.title, tk.status::text, tk.hourly_rate_cents, tk.read_scope, tk.write_scope,
        app.object_access('task', tk.id, true) as can_write, app.object_manageable('task', tk.id) as manage,
        app.task_link_token(tk.id) as link_token,
        case when app.object_manageable('task', tk.id) then coalesce((select jsonb_agg(jsonb_build_object('profile_id', og.profile_id, 'name', p.display_name, 'seed', p.avatar_seed, 'can_write', og.can_write))
          from public.object_grants og join public.profiles p on p.id = og.profile_id where og.object_type = 'task' and og.object_id = tk.id), '[]') else '[]' end as grants,
        coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'seed', p.avatar_seed)) from public.task_assignees a join public.profiles p on p.id = a.profile_id where a.task_id = tk.id), '[]') as assignees
      from public.tasks tk where tk.group_id = ${g.id} order by tk.position, tk.created_at` : [];
    const requests = active === "team" && can_manage ? await tx<{ id: string; profile_id: string; name: string; seed: number; path: string | null; message: string | null }[]>`
      select r.id, r.profile_id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path, r.message from public.group_join_requests r join public.profiles p on p.id = r.profile_id
      where r.group_id = ${g.id} and r.status = 'pending' order by r.created_at` : [];
    const invite = me ? (await tx<{ id: string; by: string | null }[]>`
      select r.id, p.display_name as by from public.group_join_requests r left join public.profiles p on p.id = r.decided_by
      where r.group_id = ${g.id} and r.profile_id = ${me} and r.direction = 'invite' and r.status = 'pending' limit 1`)[0] ?? null : null;
    const canInvite = me ? (await tx<{ ok: boolean }[]>`select app.may_invite(${g.id}, 'contributor') as ok`)[0].ok : false;
    const team = active === "team" && role ? {
      links: canInvite ? await tx<{ id: string; role: string; expires_at: string; max_uses: number | null; uses: number }[]>`
        select id, role::text, expires_at, max_uses, uses from public.group_invites where group_id = ${g.id} and revoked_at is null and expires_at > now() and (max_uses is null or uses < max_uses) order by created_at desc` : [],
      transfer: (await tx<TransferView[]>`
        select t.id, t.status, t.to_id, tp.display_name as to_name, t.from_id, fp.display_name as from_name, t.executes_at
        from public.group_transfers t join public.profiles tp on tp.id = t.to_id join public.profiles fp on fp.id = t.from_id
        where t.group_id = ${g.id} and t.status in ('proposed', 'accepted') limit 1`)[0] ?? null,
      motion: (await tx<MotionView[]>`
        select m.id, m.kind, sp.display_name as subject_name, m.closes_at, (c.n ->> 'yes')::int as yes, (c.n ->> 'no')::int as no, (c.n ->> 'members')::int as members, (c.n ->> 'mine')::boolean as mine
        from public.group_motions m join public.profiles sp on sp.id = m.subject_id, lateral (select app.motion_counts(m.id) as n) c
        where m.group_id = ${g.id} and m.status = 'open' limit 1`)[0] ?? null,
      audit: role === "admin" ? await tx<{ id: number; action: string; actor: string | null; at: string }[]>`
        select a.id, a.action, p.display_name as actor, a.created_at as at from public.audit_log a left join public.profiles p on p.id = a.actor_id
        where a.group_id = ${g.id} order by a.id desc limit 30` : [],
    } : null;
    const permRows = active === "team" ? await tx<{ holder: string; permission: string; allowed: boolean }[]>`
      select holder::text, permission::text, allowed from public.group_role_permissions where group_id = ${g.id}` : [];
    const perms: Record<string, Record<string, boolean>> = {};
    for (const p of permRows) (perms[p.holder] ??= {})[p.permission] = p.allowed;
    const similar = await tx<{ slug: string; name: string; member_count: number }[]>`
      select g2.slug::text, g2.name, g2.member_count from public.groups g2
      where g2.id <> ${g.id} and g2.archived_at is null and exists (
        select 1 from public.group_tags a join public.group_tags b on a.tag_id = b.tag_id where a.group_id = g2.id and b.group_id = ${g.id})
      order by g2.member_count desc limit 3`;
    // The collection: everything added to this group, read with the viewer's rights; subgroups and parent groups for the side.
    const items = await tx<{ item_type: string; item_id: string; note: string | null; added_by: string | null; by_name: string | null }[]>`
      select gi.item_type, gi.item_id, gi.note, gi.added_by, p.display_name as by_name from public.group_items gi left join public.profiles p on p.id = gi.added_by
      where gi.group_id = ${g.id} order by gi.created_at desc limit 200`;
    const parents = await tx<{ id: string }[]>`select gi.group_id as id from public.group_items gi where gi.item_type = 'group' and gi.item_id = ${g.id}`;
    const cards = await loadRefCards(tx, [...items.map((i) => ({ type: i.item_type, id: i.item_id })), ...parents.map((p) => ({ type: "group", id: p.id }))]);
    const collection: CollectionItem[] = items.flatMap((i) => {
      const card = cards.get(`${i.item_type}:${i.item_id}`);
      return card ? [{ card, note: i.note, byName: i.by_name, mine: i.added_by === me }] : [];
    });
    const partOf = parents.flatMap((p) => cards.get(`group:${p.id}`) ?? []) as RefCard[];
    return { collection, partOf, team, invite, canInvite, g, role, can_post, can_propose, can_vote, can_tasks, can_manage, members, tags, requested, following, goals, posts, links, needs, sentTo, tasks, requests, perms, similar, active };
  });
  if (!data) notFound();
  const { g, role, active } = data;
  const locked = g.visibility !== "public" && !role;
  const path = base;
  const voting = data.goals.filter((x) => x.status === "voting").length;
  const admins = data.members.filter((m) => m.role === "admin");
  const labels: Record<(typeof TABS)[number], string> = {
    goals: voting ? t("tabs.goalsVoting", { n: voting }) : t("tabs.goals"),
    talk: t("tabs.talk"),
    collection: data.collection.length ? `${trf("collection.tab")} · ${data.collection.length}` : trf("collection.tab"),
    links: t("tabs.links"),
    needs: t("tabs.needs", { n: data.needs.length }),
    tasks: t("tabs.tasks"),
    team: t("tabs.team"),
    about: t("tabs.about"),
  };
  // Five tabs in front, the rarer ones under "Mehr".
  const has = (k: (typeof TABS)[number]) => !(GROUP_TOOLS as readonly string[]).includes(k) || g.tools.includes(k as GroupTool);
  const front = (["goals", "talk", "collection", "tasks", "team"] as const).filter((k) => (k !== "tasks" || g.mod_tasks) && has(k));
  const back = (["links", "needs", "about"] as const).filter(has);
  const first = firstTab ?? (g.tools.includes("goals") ? "goals" : "talk");
  const tabHref = (k: (typeof TABS)[number]) => `${path}${k === first ? "" : `?tab=${k}`}`;

  const aside = (
    <>
      {data.partOf.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{trf("collection.partOf")}</h2>
          {data.partOf.map((p) => <Link key={p.id} href={p.href} className="flex items-center gap-2 text-sm text-ink no-underline"><Avatar name={p.title} size={28} group /> <strong>{p.title}</strong></Link>)}
        </section>
      )}
      {data.collection.some((i) => i.card.type === "group") && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{trf("collection.subgroups")}</h2>
          {data.collection.filter((i) => i.card.type === "group").map((i) => (
            <Link key={i.card.id} href={i.card.href} className="flex items-center gap-2 text-sm text-ink no-underline"><Avatar name={i.card.title} size={28} group /> <strong>{i.card.title}</strong></Link>
          ))}
        </section>
      )}
      {data.needs.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("needsAside")}</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.needs.slice(0, 5).map((n) => <li key={n.id}><Link href={`/listings/${n.id}`} className="text-sm text-ink no-underline hover:underline">{n.title}</Link></li>)}
          </ul>
        </section>
      )}
      {data.similar.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("similar")}</h2>
          {data.similar.map((s) => (
            <Link key={s.slug} href={`/groups/${s.slug}`} className="flex items-center gap-2 text-sm text-ink no-underline">
              <Avatar name={s.name} size={28} group /> <span><strong>{s.name}</strong> · {t("memberCount", { n: s.member_count })}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );

  const content = (
    <>
        {!locked && active === "goals" && (
          <Goals slug={slug} groupId={g.id} goals={data.goals} members={data.members.map((m) => ({ id: m.id, name: m.name }))}
            canPropose={data.can_propose} canEdit={role === "admin" || role === "maintainer"} canVote={data.can_vote} isMember={!!role && role !== "guest"} signedIn={!!session} />
        )}
        {!locked && active === "talk" && (
          <section className="flex max-w-[760px] flex-col gap-3">
            <ChatScroll count={data.posts.length} className="flex max-h-[60dvh] min-h-[240px] flex-col overflow-y-auto border border-line bg-surface px-4">
              <PostList posts={data.posts} path={`${path}?tab=talk`} canWrite={data.can_post} viewerId={me} empty={t("noPosts")} canModerate={role === "admin" || role === "maintainer"} />
            </ChatScroll>
            {data.can_post
              ? <Composer ctx={{ groupId: g.id }} path={`${path}?tab=talk`} placeholder={t("talkPlaceholder", { name: g.name })} viewerName={session?.profile.display_name} viewerSeed={session?.profile.avatar_seed} viewerPath={session?.profile.avatar_path} />
              : <p className="m-0 text-muted">{session ? t("joinToPost") : tc("signInToWrite")}</p>}
          </section>
        )}
        {!locked && active === "links" && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 max-w-[640px]">{tl("groupIntro")}</p>
              {data.can_post
                ? <Link href={`/new/link?group=${slug}`} className={btn.primarySm}>+ {tl("groupShare")}</Link>
                : <span className="text-sm text-muted">{session ? t("joinToPost") : tc("signInToWrite")}</span>}
            </div>
            {data.links.length === 0 && <Notice tone="hint" className="text-base">{tl("empty")}</Notice>}
            <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
              {data.links.map((r) => <LinkCard key={r.id} r={r} me={me ?? null} canVote={!!session?.profile.verified} />)}
            </div>
          </section>
        )}
        {!locked && active === "collection" && (
          <Collection groupId={g.id} items={data.collection} canRemoveAll={role === "admin" || role === "maintainer"} />
        )}
        {!locked && active === "needs" && (
          <section className="flex flex-col gap-4">
            <p className="m-0 max-w-[640px]">{t("needsIntro")}</p>
            {data.needs.length === 0 && <Notice tone="hint" className="text-base">{t("noNeeds")}</Notice>}
            <div className="flex flex-col border-t border-line">
              {data.needs.map((n) => (
                <div key={n.id} className="flex flex-wrap items-center gap-4 border-b border-line py-4">
                  <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                    <Link href={`/listings/${n.id}`} className="font-bold text-ink no-underline hover:underline">{n.title}</Link>
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
        {!locked && active === "tasks" && <Tasks slug={slug} groupId={g.id} tasks={data.tasks} canEdit={data.can_tasks} viewerId={me} signedIn={!!session} />}
        {!locked && active === "team" && (
          <div className="flex flex-col gap-10">
            <Leadership slug={slug} groupId={g.id} ownerId={g.owner_id} ownerName={g.owner_name} orphaned={!!g.orphaned_at} viewerId={me} isMember={!!role}
              candidates={data.members.filter((m) => m.id !== me && (m.role === "admin" || m.role === "maintainer")).map((m) => ({ id: m.id, name: m.name }))}
              transfer={data.team?.transfer ?? null} motion={data.team?.motion ?? null} canTakeover={g.can_takeover} />
            {data.canInvite && (
              <Invites slug={slug} groupId={g.id} links={data.team?.links ?? []}
                roles={me === g.owner_id ? ["contributor", "guest", "maintainer", "admin"] : role === "admin" ? ["contributor", "guest", "maintainer"] : ["contributor", "guest"]} />
            )}
            <Team slug={slug} groupId={g.id} ownerId={g.owner_id} members={data.members} requests={data.requests}
              perms={data.perms} myRole={role} canManage={data.can_manage} viewerId={me} />
            {role === "admin" && (
              <>
                <GroupRules slug={slug} groupId={g.id} visibility={g.visibility} joinPolicy={g.join_policy} adultsOnly={g.adults_only} slowMode={g.slow_mode_seconds} adminsManageInitiatives={g.admins_manage_initiatives} />
                <Section title={tr("log.title")}>
                  <span className="text-sm text-muted">{tr("log.text")}</span>
                  {(data.team?.audit.length ?? 0) === 0 && <span className="text-muted">{tr("log.empty")}</span>}
                  {data.team?.audit.map((a) => (
                    <span key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-1.5 text-sm">
                      <span>{tr.has(`log.actions.${a.action}`) ? tr(`log.actions.${a.action}` as "log.actions.set_role") : a.action}{a.actor ? ` · ${a.actor}` : ""}</span>
                      <span className="text-muted">{dateTime(a.at, locale)}</span>
                    </span>
                  ))}
                </Section>
                <DangerZone slug={slug} groupId={g.id} archived={!!g.archived_at} deleteRequestedAt={g.delete_requested_at} isOwner={me === g.owner_id} isAdmin />
              </>
            )}
          </div>
        )}
        {!locked && active === "about" && role === "admin" && <GroupTools slug={slug} groupId={g.id} tools={g.tools} />}
        {!locked && active === "about" && (
          <section className="flex max-w-[720px] flex-col gap-4">
            <p className="m-0 whitespace-pre-line text-lg leading-relaxed">{g.description ?? g.summary ?? t("noDescription")}</p>
            <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-t border-line pt-4">
              <dt className="font-bold">{t("kind")}</dt><dd className="m-0">{t(`kinds.${g.kind}`)}</dd>
              <dt className="font-bold">{t("team")}</dt><dd className="m-0">{t("memberCount", { n: g.member_count })}</dd>
              <dt className="font-bold">{t("founded")}</dt><dd className="m-0">{dateLong(g.created_at, locale)}</dd>
            </dl>
          </section>
        )}
    </>
  );
  if (bare) return <div className="@container"><div className="flex flex-col gap-5 px-4 py-4 md:px-6">{content}</div></div>;
  return (
    <Page aside={embedded ? undefined : aside}>
        {!embedded && <BackLink href="/friends?f=groups" label={t("groups")} />}
        {g.cover_path && <Cover seed={g.cover_seed} src={g.cover_path} ratio={embedded ? "5 / 1" : "21 / 9"} />}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={tag}>{t(`kinds.${g.kind}`)}</span>
            {g.region_name && <span className={tag}>{g.region_name}</span>}
            <span className={tag}>{t(`policy.${g.join_policy}`)}</span>
            {g.visibility !== "public" && <span className={tag}>{tr(`vis.${g.visibility}` as "vis.members")}</span>}
            {g.adults_only && <span className={tag}>{tr("adultsOnly")}</span>}
            {data.tags.map((x) => <span key={x.slug} className={tag}>#{x.slug}</span>)}
          </div>
          <h1 className="display m-0 break-words">{g.name}</h1>
          {g.summary && <p className="m-0 max-w-[720px] text-base md:text-xl">{g.summary}</p>}
          <span className="flex flex-wrap items-center gap-2 text-sm">
            {admins.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} seed={a.seed} size={28} />)}
            {t("memberCount", { n: g.member_count })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <JoinPanel slug={slug} id={g.id} policy={g.join_policy} role={role} requested={data.requested} signedIn={!!session}
            lastAdmin={role === "admin" && admins.length === 1} />
          {session && <FollowButton type="group" id={g.id} following={data.following} size="md" />}
          <ShareBlock path={`/groups/${slug}`} title={g.name} isPublic={g.visibility === "public"} item={session ? { type: "group", id: g.id } : null} />
        </div>
        {g.archived_at && <Notice tone="warning">{tr("danger.archived")}</Notice>}
        {data.invite && <InviteBanner requestId={data.invite.id} by={data.invite.by ?? "?"} slug={slug} />}

        {locked && <Notice tone="status" className="font-normal">{data.invite && g.visibility === "secret" ? tr("lockedSecret") : tr("lockedTitle")}</Notice>}
        {!locked && <Tabs label={t("sections")} moreLabel={tc("more")}
          items={front.map((k) => ({ href: tabHref(k), label: labels[k], on: active === k }))}
          more={back.map((k) => ({ href: tabHref(k), label: labels[k], on: active === k }))} />}
        {!locked && role === "admin" && g.tools.length < GROUP_TOOLS.length && active !== "about" && (
          <Link href={`${path}?tab=about#tools`} className="self-start text-sm text-ink underline">{t("tools.add")}</Link>
        )}

{content}
      {embedded && aside}
    </Page>
  );
}
