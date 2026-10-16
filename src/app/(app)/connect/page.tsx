import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts, marketTags } from "@/lib/posts";
import { myMunicipality } from "@/lib/queries";
import { getPlace } from "@/lib/place";
import { relTime } from "@/lib/format";
import type { Message } from "@/lib/actions/messages";
import { Avatar } from "@/components/ui/Avatar";
import { Composer, PostList } from "@/components/PostList";
import { Conversation } from "@/components/connect/Conversation";
import { RequestPane, type RequestView } from "@/components/connect/RequestPane";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ChatScroll } from "@/components/ChatScroll";
import { MarketFilter, type Radius } from "@/components/connect/MarketFilter";
import { IconBack, IconPlus } from "@/components/ui/Icons";
import { btn } from "@/components/ui/styles";

export async function generateMetadata() {
  return { title: (await getTranslations("connect"))("title") };
}

type Kind = "market" | "group" | "direct" | "request" | "join";
type Row = { key: string; name: string; kind: Kind; sub: string; preview: string | null; at: string | Date | null; unread: number; seed?: number; path?: string | null; tag?: string; groupAvatar?: boolean };
const FILTERS = ["all", "chats", "groups", "requests"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_KINDS: Record<Filter, Kind[]> = { all: ["market", "group", "direct", "request", "join"], chats: ["direct"], groups: ["market", "group"], requests: ["request", "join"] };

type DirectRow = { id: string; title: string | null; other: string; other_seed: number; other_path: string | null; preview: string | null; at: string; unread: number };

export default async function Connect({ searchParams }: PageProps<"/connect">) {
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("connect");
  const tl = await getTranslations("levels");
  const locale = await getLocale();
  const place = await getPlace();
  const mode = sp.mode === "suggested" ? "suggested" : "chrono";
  const filter: Filter = (FILTERS as readonly string[]).includes(String(sp.f)) ? (sp.f as Filter) : "all";
  const sel = typeof sp.c === "string" ? sp.c : "market";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const radiusParam = typeof sp.r === "string" ? sp.r : "";

  const data = await asViewer(viewer, async (tx) => {
    // Test phase: demo profiles send a few chats and requests so this page is not empty.
    if (me) await tx`select app.ensure_demo_chats()`;
    // The marketplace belongs to the place in the header: a member's home place or the one a guest picked.
    const chain = (place?.chain ?? []).filter((r) => ["municipality", "district", "state", "country"].includes(r.level));
    const muni = chain.find((r) => r.level === "municipality") ?? (await myMunicipality(tx, me ?? undefined));
    // "Radius": the municipality and the regions above it, from near to far.
    const radii: (Radius & { id: string })[] = chain.map((r, _i, all) => ({ id: r.id, key: r.level, name: all.filter((x) => x.name === r.name).length > 1 ? `${tl(r.level as "all")} ${r.name}` : r.name }));
    const groups = me ? await tx<{ id: string; slug: string; name: string; member_count: number; preview: string | null; author: string | null; at: string | null }[]>`
      select g.id, g.slug::text, g.name, g.member_count,
        (select p.body from public.posts p where p.group_id = g.id and p.parent_id is null and p.hidden_at is null order by p.created_at desc limit 1) as preview,
        (select a.display_name from public.posts p join public.profiles a on a.id = p.author_id where p.group_id = g.id and p.parent_id is null order by p.created_at desc limit 1) as author,
        (select max(p.created_at) from public.posts p where p.group_id = g.id) as at
      from public.group_members m join public.groups g on g.id = m.group_id where m.profile_id = ${me} order by at desc nulls last` : [];
    const directs = me ? await tx<DirectRow[]>`
      select c.id, c.title, op.display_name as other, op.avatar_seed as other_seed, op.avatar_path as other_path, c.last_message_at as at,
        (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as preview,
        (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id <> ${me} and m.created_at > mine.last_read_at) as unread
      from public.conversations c
      join public.conversation_participants mine on mine.conversation_id = c.id and mine.profile_id = ${me}
      join public.conversation_participants o on o.conversation_id = c.id and o.profile_id <> ${me}
      join public.profiles op on op.id = o.profile_id
      order by c.last_message_at desc` : [];
    // Everything I sent or must answer: requests from offers and needs, first messages, group join requests.
    const requests = me ? await tx<RequestView[]>`
      select r.id, 'contact' as type, (r.from_profile_id = ${me}) as outgoing, r.status::text, r.message, r.created_at,
             l.title, l.id as listing_id, l.kind::text as listing_kind, null::text as group_slug,
             o.id as other_id, o.display_name as other_name, o.avatar_seed as other_seed, o.avatar_path as other_path
      from public.contact_requests r
      join public.profiles o on o.id = case when r.from_profile_id = ${me} then r.to_profile_id else r.from_profile_id end
      left join public.listings l on l.id = r.listing_id
      where (r.from_profile_id = ${me} or r.to_profile_id = ${me})
        and (r.status = 'pending' or (r.status = 'declined' and r.from_profile_id = ${me} and r.decided_at > now() - interval '14 days'))
      union all
      select j.id, 'join', (j.profile_id = ${me}), j.status::text, j.message, j.created_at,
             g.name, null, null, g.slug::text,
             o.id, o.display_name, o.avatar_seed, o.avatar_path
      from public.group_join_requests j
      join public.groups g on g.id = j.group_id
      join public.profiles o on o.id = j.profile_id
      where j.direction = 'request'
        and ((j.profile_id = ${me} and (j.status = 'pending' or (j.status = 'declined' and j.decided_at > now() - interval '14 days')))
          or (j.profile_id <> ${me} and j.status = 'pending' and app.has_group_permission(j.group_id, 'manage_members')))
      order by created_at desc` : [];
    const suggestions = mode === "suggested" ? await tx<{ slug: string; name: string; member_count: number; why: string | null }[]>`
      select g.slug::text, g.name, g.member_count,
        (select t.slug::text from public.group_tags gt join public.tags t on t.id = gt.tag_id
         join public.user_interests ui on ui.tag_id = gt.tag_id and ui.profile_id = ${me} where gt.group_id = g.id limit 1) as why
      from public.groups g where g.visibility = 'public' and g.archived_at is null and ${me ? tx`app.group_role(g.id) is null` : tx`true`}
      order by (exists (select 1 from public.group_tags gt join public.user_interests ui on ui.tag_id = gt.tag_id and ui.profile_id = ${me} where gt.group_id = g.id)) desc,
               g.member_count desc limit 6` : [];

    type Pane =
      | { kind: "market"; posts: Awaited<ReturnType<typeof loadPosts>>; tags: string[]; area: string }
      | { kind: "group"; group: { id: string; slug: string; name: string; member_count: number; can_post: boolean }; posts: Awaited<ReturnType<typeof loadPosts>> }
      | { kind: "direct"; id: string; other: string; other_id: string; other_seed: number; other_path: string | null; title: string | null; listing_id: string | null; listing_kind: string | null; messages: Message[]; other_read_at: string | null }
      | { kind: "request"; request: RequestView };
    let pane: Pane | null = null;
    if (sel === "market") {
      const regionIds = muni ? [muni.id] : (await tx<{ id: string }[]>`select id from public.regions where level = 'municipality' and id in (select distinct region_id from public.posts where region_id is not null) limit 50`).map((r) => r.id);
      const area = radii.find((r) => r.key === radiusParam) ?? radii[0];
      const scope = area ? { underRegionId: area.id, search: q } : { regionIds, search: q };
      pane = { kind: "market", posts: await loadPosts(tx, scope, me, { sort: "new" }), tags: area ? await marketTags(tx, area.id) : [], area: area?.key ?? "" };
    } else if (sel.startsWith("g:")) {
      const [g] = await tx<{ id: string; slug: string; name: string; member_count: number; can_post: boolean }[]>`
        select g.id, g.slug::text, g.name, g.member_count, app.has_group_permission(g.id, 'post') as can_post from public.groups g where g.slug = ${sel.slice(2)}`;
      if (g) pane = { kind: "group", group: g, posts: await loadPosts(tx, { groupId: g.id }, me, { sort: "chat", limit: 60 }) };
    } else if (sel.startsWith("d:") && me && /^[0-9a-f-]{36}$/.test(sel.slice(2))) {
      const id = sel.slice(2);
      const [c] = await tx<{ id: string; title: string | null; other: string; other_id: string; other_seed: number; other_path: string | null; listing_id: string | null; listing_kind: string | null; other_read_at: string | null }[]>`
        select c.id, c.title, op.display_name as other, op.id as other_id, op.avatar_seed as other_seed, op.avatar_path as other_path,
               l.id as listing_id, l.kind::text as listing_kind, o.last_read_at as other_read_at
        from public.conversations c
        join public.conversation_participants o on o.conversation_id = c.id and o.profile_id <> ${me}
        join public.profiles op on op.id = o.profile_id
        left join public.contact_requests cr on cr.id = c.contact_request_id
        left join public.listings l on l.id = cr.listing_id
        where c.id = ${id}`;
      if (c) {
        const messages = await tx<Message[]>`
          select m.id, m.body, m.created_at, m.sender_id, p.display_name as sender_name, p.avatar_seed as sender_seed, p.avatar_path as sender_path
          from public.messages m join public.profiles p on p.id = m.sender_id where m.conversation_id = ${id} order by m.created_at`;
        await tx`update public.conversation_participants set last_read_at = now() where conversation_id = ${id} and profile_id = ${me}`;
        await tx`update public.notifications set read_at = now() where profile_id = ${me} and kind = 'message' and read_at is null and payload ->> 'conversation_id' = ${id}`;
        pane = { kind: "direct", ...c, messages };
      }
    } else if ((sel.startsWith("c:") || sel.startsWith("j:")) && me) {
      const request = requests.find((r) => r.id === sel.slice(2) && r.type === (sel.startsWith("c:") ? "contact" : "join"));
      if (request) {
        pane = { kind: "request", request };
        await tx`update public.notifications set read_at = now() where profile_id = ${me} and read_at is null and kind = 'contact_request' and payload ->> 'request_id' = ${request.id}`;
      }
    }
    return { muni, radii, groups, directs, requests, suggestions, pane };
  });

  const rows: Row[] = [
    { key: "market", name: t("market"), kind: "market", sub: data.muni ? t("marketSub", { place: data.muni.name }) : t("marketSubAll"), preview: null, at: null, unread: 0 },
    ...data.directs.map((d) => ({ key: `d:${d.id}`, name: d.other, kind: "direct" as const, sub: t("private", { title: d.title ?? "" }), preview: d.preview, at: d.at, unread: d.unread, seed: d.other_seed, path: d.other_path })),
    ...data.groups.map((g) => ({ key: `g:${g.slug}`, name: g.name, kind: "group" as const, sub: t("groupSub", { n: g.member_count }), preview: g.preview ? `${g.author?.split(" ")[0]}: ${g.preview}` : null, at: g.at, unread: 0 })),
    ...data.requests.map((r): Row => {
      const join = r.type === "join";
      return {
        key: `${join ? "j" : "c"}:${r.id}`,
        kind: join ? "join" : "request",
        name: join && r.outgoing ? (r.title ?? "") : r.other_name,
        sub: join ? t(r.outgoing ? "req.outJoin" : "req.inJoin")
          : r.listing_id ? t(r.outgoing ? "req.outContact" : "req.inContact", { title: r.title ?? "" }) : t(r.outgoing ? "req.outDirect" : "req.inDirect"),
        preview: r.message, at: r.created_at, unread: 0,
        seed: join && r.outgoing ? undefined : r.other_seed, path: join && r.outgoing ? null : r.other_path,
        groupAvatar: join && r.outgoing,
        tag: r.status === "pending" ? (r.outgoing ? t("req.pending") : t("req.newTag")) : t("req.declined"),
      };
    }),
  ];
  const shown = rows.filter((r) => FILTER_KINDS[filter].includes(r.kind));
  if (mode === "chrono") shown.sort((a, b) => (a.kind === "market" ? -1 : b.kind === "market" ? 1 : (b.at ? new Date(b.at).getTime() : 0) - (a.at ? new Date(a.at).getTime() : 0)));
  const counts = {
    all: 0,
    chats: data.directs.reduce((n, d) => n + d.unread, 0),
    groups: 0,
    requests: data.requests.filter((r) => r.status === "pending" && !r.outgoing).length,
  };
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ c: sel, mode, f: filter, ...patch });
    if ((patch.c ?? sel) === "market") {
      if (q) p.set("q", q);
      if (radiusParam) p.set("r", radiusParam);
    }
    if (p.get("mode") === "chrono") p.delete("mode");
    if (p.get("f") === "all") p.delete("f");
    if (!p.get("c")) p.delete("c");
    return `/connect${p.size ? `?${p}` : ""}`;
  };
  const pane = data.pane;
  const paneOpen = typeof sp.c === "string";
  // On phones one pane fills the screen; the arrow in its header goes back to the list.
  const back = <Link href={href({ c: "" })} aria-label={t("back")} className="inline-flex h-9 w-9 flex-none items-center justify-center text-ink lg:hidden"><IconBack size={18} /></Link>;
  const hasAnything = data.directs.length + data.groups.length + data.requests.length > 0;

  return (
    <div className="flex flex-col px-0 pb-0 pt-0 max-md:h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:gap-4 md:px-10 md:pb-12 md:pt-10 lg:h-[calc(100dvh-72px)] lg:min-h-[560px] lg:pb-8 lg:pt-6">
      <AutoRefresh seconds={pane?.kind === "direct" ? 60 : 20} />
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 md:px-0">
        <h1 className="display m-0 max-md:sr-only">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-4 max-md:hidden">
          {session && <Link href="/new/group" className={`${btn.secondary} gap-1.5`}><IconPlus size={16} /> {t("newGroup")}</Link>}
          <div role="group" aria-label={t("order")} className="flex gap-4">
            {(["chrono", "suggested"] as const).map((m) => (
              <Link key={m} href={href({ mode: m })} aria-pressed={mode === m} className={`pb-1 text-ink no-underline ${mode === m ? "border-b-[3px] border-ink font-bold" : "text-muted"}`}>{t(`mode.${m}`)}</Link>
            ))}
          </div>
        </div>
      </div>
      {!session && <p className="m-0 border-l-4 border-ink bg-surface px-3 py-2 text-sm md:mx-0 md:px-4 md:py-3 md:text-base"><strong>{t("guestTitle")}</strong> <span className="md:hidden">{t("guestTextShort")}</span><span className="max-md:hidden">{t("guestText")}</span> <Link href="/login?next=/connect" className="font-bold">{t("signIn")}</Link></p>}
      <div className="flex min-h-[70dvh] flex-col border-y border-line bg-surface max-md:min-h-0 max-md:flex-1 lg:min-h-0 lg:flex-1 lg:flex-row lg:border">
        <section aria-label={t("conversations")} className={`${paneOpen ? "hidden lg:flex" : "flex"} w-full flex-none flex-col overflow-y-auto border-line max-md:min-h-0 max-md:flex-1 lg:w-[360px] lg:border-r`}>
          {session && (
            <div role="group" aria-label={t("filter.label")} className="sticky top-0 z-10 grid flex-none grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-1 border-b border-line bg-surface p-1.5 md:grid-cols-4 md:p-2">
              {FILTERS.map((f) => (
                <Link key={f} href={href({ f, c: "" })} aria-pressed={filter === f}
                  className={`relative inline-flex h-8 items-center justify-center gap-1 px-1 text-[13px] no-underline ${filter === f ? "bg-ink font-bold text-on-ink" : "bg-chip text-ink"}`}>
                  {t(`filter.${f}`)}
                  {counts[f] > 0 && <span className={`inline-flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-bold leading-none ${filter === f ? "bg-on-ink text-ink" : "bg-ink text-on-ink"}`}>{counts[f]}</span>}
                </Link>
              ))}
              <Link href="/new/group" aria-label={t("newGroup")} title={t("newGroup")} className="inline-flex h-8 w-8 items-center justify-center bg-chip text-ink md:hidden"><IconPlus size={16} /></Link>
            </div>
          )}
          <div role="group" aria-label={t("order")} className="flex flex-none items-center gap-4 border-b border-line px-3 py-1.5 text-xs md:hidden">
            {(["chrono", "suggested"] as const).map((m) => (
              <Link key={m} href={href({ mode: m })} aria-pressed={mode === m} className={`text-ink no-underline ${mode === m ? "border-b-2 border-ink font-bold" : "text-muted"}`}>{t(`mode.${m}`)}</Link>
            ))}
          </div>
          {shown.map((r) => (
            <Link key={r.key} href={href({ c: r.key })} aria-current={sel === r.key ? "true" : undefined}
              className={`flex gap-3 border-b border-line px-3 py-2 text-ink no-underline md:px-4 md:py-3 ${sel === r.key ? "bg-paper" : ""}`}>
              <Avatar name={r.name} seed={r.seed} path={r.path} size={40} group={r.groupAvatar ?? (r.kind === "market" || r.kind === "group")} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex justify-between gap-2"><strong className="truncate">{r.name}</strong>{r.at && <span className="flex-none text-xs text-muted">{relTime(r.at, locale)}</span>}</span>
                <span className="truncate text-xs text-muted">{r.kind === "market" ? `${t("pinned")} · ` : ""}{r.sub}</span>
                {r.preview && <span className={`truncate text-sm ${r.unread ? "font-bold" : "text-muted"}`}>{r.preview}</span>}
              </span>
              {r.unread > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center self-center bg-ink px-1 text-xs font-bold text-on-ink" aria-label={t("unread", { n: r.unread })}>{r.unread}</span>}
              {r.tag && <span className={`self-center whitespace-nowrap px-1.5 py-0.5 text-xs font-bold ${r.tag === t("req.newTag") ? "bg-red text-on-red" : "border border-line-strong"}`}>{r.tag}</span>}
            </Link>
          ))}
          {session && shown.length <= (filter === "all" || filter === "groups" ? 1 : 0) && (
            <p className="m-0 px-4 py-6 text-sm text-muted">{hasAnything || filter !== "all" ? t("emptyFilter") : t("emptyList")}</p>
          )}
          {session && (filter === "all" || filter === "groups") && (
            <Link href="/new/group" className="flex items-center gap-3 border-b border-line px-4 py-3 text-ink no-underline">
              <span className="inline-flex h-11 w-11 flex-none items-center justify-center border border-dashed border-ink"><IconPlus size={18} /></span>
              <span className="flex min-w-0 flex-col"><strong>{t("newGroup")}</strong><span className="text-xs text-muted">{t("newGroupHint")}</span></span>
            </Link>
          )}
          {data.suggestions.length > 0 && (
            <>
              <span className="px-4 pb-1 pt-4 text-sm font-bold">{t("suggestions")}</span>
              {data.suggestions.map((s) => (
                <Link key={s.slug} href={`/groups/${s.slug}`} className="flex items-center gap-3 border-b border-line px-4 py-3 text-ink no-underline">
                  <Avatar name={s.name} size={36} group />
                  <span className="flex min-w-0 flex-col"><strong>{s.name}</strong>
                    <span className="text-xs text-muted">{s.why ? t("because", { tag: s.why }) : t("popular")} · {t("groupSub", { n: s.member_count })}</span></span>
                </Link>
              ))}
            </>
          )}
        </section>
        <section aria-label={t("pane")} className={`${paneOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col px-3 py-2 max-md:overflow-hidden md:px-6 md:py-4 lg:overflow-hidden`}>
          {(!pane || pane.kind === "request") && <Link href={href({ c: "" })} className="mb-2 inline-flex items-center gap-1 text-sm text-ink lg:hidden"><IconBack size={14} /> {t("back")}</Link>}
          {pane?.kind === "market" && (
            <>
              <header className="flex flex-none items-center justify-between gap-2 border-b border-line pb-2 md:gap-3 md:pb-3">
                <div className="flex min-w-0 items-center gap-1">{back}<div className="flex min-w-0 flex-col"><strong className="text-lg leading-tight">{t("market")}</strong><span className="truncate text-sm text-muted"><span className="md:hidden">{data.muni ? t("marketSub", { place: data.muni.name }) : t("marketSubAll")}</span><span className="max-md:hidden">{data.muni ? t("marketOpen", { place: data.muni.name }) : t("marketSubAll")}</span></span></div></div>
                <MarketFilter radii={data.radii} radius={pane.area} q={q} tags={pane.tags} keep={{ ...(mode !== "chrono" ? { mode } : {}), ...(filter !== "all" ? { f: filter } : {}) }} />
              </header>
              {session && data.muni ? <div className="flex-none py-3"><Composer ctx={{ regionId: data.muni.id }} path="/connect" placeholder={t("marketPlaceholder")} viewerName={session.profile.display_name} viewerSeed={session.profile.avatar_seed} viewerPath={session.profile.avatar_path} /></div>
                : !session && <p className="m-0 flex-none py-3 text-sm text-muted">{t("readOnly")}</p>}
              <div className="max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <PostList posts={pane.posts} path="/connect" canWrite={!!session?.profile.verified} viewerId={me ?? undefined} empty={q || pane.area !== data.radii[0]?.key ? t("mf.none") : t("marketEmpty")} />
              </div>
            </>
          )}
          {pane?.kind === "group" && (
            <>
              <header className="flex flex-none items-center justify-between gap-2 border-b border-line pb-2 md:gap-3 md:pb-3">
                <div className="flex min-w-0 items-center gap-1">{back}<Link href={`/groups/${pane.group.slug}`} className="flex min-w-0 flex-col text-ink no-underline"><strong className="truncate text-lg leading-tight">{pane.group.name}</strong><span className="text-sm text-muted">{t("groupSub", { n: pane.group.member_count })}</span></Link></div>
                <Link href={`/groups/${pane.group.slug}`} className="text-sm font-bold text-ink">{t("openGroup")}</Link>
              </header>
              <ChatScroll count={pane.posts.length} className="flex max-h-[55dvh] min-h-[280px] flex-1 flex-col overflow-y-auto max-md:max-h-none max-md:min-h-0 lg:max-h-none lg:min-h-0">
                <PostList posts={pane.posts} path="/connect" canWrite={pane.group.can_post} viewerId={me ?? undefined} empty={t("groupEmpty")} />
              </ChatScroll>
              {pane.group.can_post && <div className="flex-none border-t border-line pt-3"><Composer ctx={{ groupId: pane.group.id }} path="/connect" placeholder={t("groupPlaceholder", { name: pane.group.name })} viewerName={session?.profile.display_name} viewerSeed={session?.profile.avatar_seed} viewerPath={session?.profile.avatar_path} /></div>}
            </>
          )}
          {pane?.kind === "direct" && me && (
            <>
              <header className="flex flex-none items-center gap-2 border-b border-line pb-2 md:gap-3 md:pb-3">
                {back}
                <Avatar name={pane.other} seed={pane.other_seed} path={pane.other_path} size={44} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/profile/${pane.other_id}`} className="truncate text-lg font-bold text-ink no-underline">{pane.other}</Link>
                  {pane.title
                    ? <span className="truncate text-sm text-muted">{pane.listing_id
                      ? <Link href={`/${pane.listing_kind === "need" ? "needs" : "offers"}/${pane.listing_id}`} className="text-muted">{t("about", { title: pane.title })}</Link>
                      : t("about", { title: pane.title })}</span>
                    : <span className="text-sm text-muted">{t("private", { title: "" }).replace(/ · $/, "")}</span>}
                </div>
              </header>
              <Conversation key={pane.id} id={pane.id} initial={pane.messages} viewerId={me} otherName={pane.other.split(" ")[0]} otherReadAt={pane.other_read_at} />
            </>
          )}
          {pane?.kind === "request" && <div className="min-h-0 flex-1 overflow-y-auto"><RequestPane key={pane.request.id} r={pane.request} /></div>}
          {!pane && <p className="m-0 text-muted">{t("pick")}</p>}
        </section>
      </div>
    </div>
  );
}
