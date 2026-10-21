import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadMessages } from "@/lib/messages";
import { relTime } from "@/lib/format";
import type { Message } from "@/lib/actions/messages";
import { Avatar } from "@/components/ui/Avatar";
import { BackToList } from "@/components/shell/Split";
import { GroupView } from "@/app/(app)/groups/[slug]/page";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { AreaIcon } from "@/components/ui/Logo";
import { Conversation } from "@/components/connect/Conversation";
import { ChatMenu } from "@/components/connect/ChatMenu";
import { RequestPane, type RequestView } from "@/components/connect/RequestPane";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ListSearch } from "@/components/connect/ListSearch";
import { Popover } from "@/components/ui/Popover";
import { IconBack, IconCheck, IconPlus } from "@/components/ui/Icons";
import { btn } from "@/components/ui/styles";
import { Notice } from "@/components/ui/Page";

export async function generateMetadata() {
  return { title: (await getTranslations("connect"))("title") };
}

type Kind = "group" | "direct" | "request" | "join" | "listing";
type Row = { key: string; name: string; kind: Kind; sub: string; preview: string | null; at: string | Date | null; unread: number; seed?: number; path?: string | null; tag?: string; groupAvatar?: boolean };
const FILTERS = ["all", "chats", "groups", "requests", "listings"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_KINDS: Record<Filter, Kind[]> = { all: ["group", "direct", "request", "join"], chats: ["direct"], groups: ["group"], requests: ["request", "join"], listings: ["listing"] };

type DirectRow = { id: string; title: string | null; other: string; other_seed: number; other_path: string | null; preview: string | null; at: string; unread: number };

export default async function Connect({ searchParams }: PageProps<"/friends">) {
  return <FriendsView sp={await searchParams} />;
}

/**
 * Freunde: chats, my groups, requests and the listings of people I know on the left, the opened one on the right.
 * `group`: a group opened at /friends/g/[slug] (with its tabs and tools, not just the chat).
 */
export async function FriendsView({ sp, group }: { sp: Record<string, string | string[] | undefined>; group?: string }) {
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("connect");
  const te = await getTranslations("explore");
  const ts = await getTranslations("safety");
  const locale = await getLocale();
  const mode = sp.mode === "suggested" ? "suggested" : "chrono";
  const filter: Filter = (FILTERS as readonly string[]).includes(String(sp.f)) ? (sp.f as Filter) : "all";
  const sel = group ? `g:${group}` : typeof sp.c === "string" ? sp.c : "";
  const s = typeof sp.s === "string" ? sp.s.trim().slice(0, 80) : "";

  const data = await asViewer(viewer, async (tx) => {
    // Test phase: demo profiles send a few chats and requests so this page is not empty.
    if (me) await tx`select app.ensure_demo_chats()`;
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
      where mine.hidden_at is null or c.last_message_at > mine.hidden_at
      order by c.last_message_at desc` : [];
    // Everything I sent or must answer: requests from offers and needs, first messages, group join requests.
    const requests = me ? await tx<RequestView[]>`
      select r.id, 'contact' as type, (r.from_profile_id = ${me}) as outgoing, r.status::text, r.message, r.created_at,
             l.title, l.id as listing_id, l.kind::text as listing_kind, null::text as group_slug,
             v.id as via_id, v.title as via_title, v.kind::text as via_kind,
             o.id as other_id, o.display_name as other_name, o.avatar_seed as other_seed, o.avatar_path as other_path
      from public.contact_requests r
      join public.profiles o on o.id = case when r.from_profile_id = ${me} then r.to_profile_id else r.from_profile_id end
      left join public.listings l on l.id = r.listing_id
      left join public.listings v on v.id = r.via_listing_id
      where (r.from_profile_id = ${me} or r.to_profile_id = ${me})
        and (r.status = 'pending' or (r.status = 'declined' and r.from_profile_id = ${me} and r.decided_at > now() - interval '14 days'))
      union all
      select j.id, 'join', (j.profile_id = ${me}), j.status::text, j.message, j.created_at,
             g.name, null, null, g.slug::text,
             null, null, null,
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

    // Anliegen meiner Bekannten: listings of the people I chat with and of the members of my groups.
    const listings = me ? await tx<{ id: string; title: string; kind: string; owner: string; owner_seed: number; owner_path: string | null; created_at: string }[]>`
      select l.id, l.title, l.kind::text, o.display_name as owner, o.avatar_seed as owner_seed, o.avatar_path as owner_path, l.created_at
      from public.listings l join public.profiles o on o.id = l.owner_id
      where l.status = 'active' and l.owner_id <> ${me} and (
        exists (select 1 from public.conversation_participants a join public.conversation_participants b on b.conversation_id = a.conversation_id
                where a.profile_id = ${me} and b.profile_id = l.owner_id)
        or exists (select 1 from public.group_members a join public.group_members b on b.group_id = a.group_id
                   where a.profile_id = ${me} and b.profile_id = l.owner_id))
      order by l.created_at desc limit 50` : [];
    type Pane =
      | { kind: "group"; slug: string }
      | { kind: "listing"; id: string }
      | { kind: "direct"; id: string; other: string; other_id: string; other_seed: number; other_path: string | null; title: string | null; listing_id: string | null; listing_kind: string | null; messages: Message[]; other_read_at: string | null; muted: boolean; blocked: boolean; ttl_days: number | null; ttl_proposed_days: number | null; ttl_by_me: boolean; as_of: string }
      | { kind: "request"; request: RequestView };
    let pane: Pane | null = null;
    if (sel.startsWith("g:")) {
      pane = { kind: "group", slug: sel.slice(2) };
    } else if (sel.startsWith("l:") && /^[0-9a-f-]{36}$/.test(sel.slice(2))) {
      pane = { kind: "listing", id: sel.slice(2) };
    } else if (sel.startsWith("d:") && me && /^[0-9a-f-]{36}$/.test(sel.slice(2))) {
      const id = sel.slice(2);
      const [c] = await tx<{ id: string; title: string | null; other: string; other_id: string; other_seed: number; other_path: string | null; listing_id: string | null; listing_kind: string | null; other_read_at: string | null; muted: boolean; blocked: boolean; ttl_days: number | null; ttl_proposed_days: number | null; ttl_by_me: boolean; as_of: string }[]>`
        select c.id, c.title, op.display_name as other, op.id as other_id, op.avatar_seed as other_seed, op.avatar_path as other_path,
               l.id as listing_id, l.kind::text as listing_kind, o.last_read_at as other_read_at,
               mine.muted, exists (select 1 from public.blocks b where b.blocker_id = ${me} and b.blocked_id = op.id) as blocked,
               c.ttl_days, c.ttl_proposed_days, c.ttl_proposed_by = ${me} as ttl_by_me,
               to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as as_of
        from public.conversations c
        join public.conversation_participants mine on mine.conversation_id = c.id and mine.profile_id = ${me}
        join public.conversation_participants o on o.conversation_id = c.id and o.profile_id <> ${me}
        join public.profiles op on op.id = o.profile_id
        left join public.contact_requests cr on cr.id = c.contact_request_id
        left join public.listings l on l.id = cr.listing_id
        where c.id = ${id}`;
      if (c) {
        const messages = await loadMessages(tx, id);
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
    return { groups, directs, requests, listings, suggestions, pane };
  });

  const rows: Row[] = [
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
    ...data.listings.map((l): Row => ({ key: `l:${l.id}`, name: l.title, kind: "listing", sub: t(l.kind === "need" ? "listingNeed" : "listingOffer", { name: l.owner }), preview: null, at: l.created_at, unread: 0, seed: l.owner_seed, path: l.owner_path })),
  ];
  const haystack = (r: Row) => [r.name, r.sub, r.preview ?? ""].join(" ").toLowerCase();
  const shown = rows.filter((r) => FILTER_KINDS[filter].includes(r.kind) && (!s || haystack(r).includes(s.toLowerCase())));
  // "Chronologisch": newest first. "Vorgeschlagen": what waits for an answer first, then newest.
  const needsAnswer = (r: Row) => (r.unread > 0 || r.tag === t("req.newTag") ? 1 : 0);
  const newest = (r: Row) => (r.at ? new Date(r.at).getTime() : 0);
  shown.sort((a, b) => (mode === "suggested" ? needsAnswer(b) - needsAnswer(a) : 0) || newest(b) - newest(a));
  const counts = {
    all: 0,
    chats: data.directs.reduce((n, d) => n + d.unread, 0),
    groups: 0,
    requests: data.requests.filter((r) => r.status === "pending" && !r.outgoing).length,
    listings: 0,
  };
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ c: typeof sp.c === "string" && !group ? sel : "", mode, f: filter, ...patch });
    if (s && !("s" in patch)) p.set("s", s);
    if (p.get("mode") === "chrono") p.delete("mode");
    if (p.get("f") === "all") p.delete("f");
    if (!p.get("c")) p.delete("c");
    return `/friends${p.size ? `?${p}` : ""}`;
  };
  const pane = data.pane;
  const paneOpen = !!group || typeof sp.c === "string";
  // On phones one pane fills the screen; the arrow in its header goes back to the list.
  const back = <Link href={href({ c: "" })} aria-label={t("back")} className="inline-flex h-9 w-9 flex-none items-center justify-center text-ink md:hidden"><IconBack size={18} /></Link>;
  const hasAnything = data.directs.length + data.groups.length + data.requests.length > 0;

  return (
    <div className="flex flex-col max-md:h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-4rem)] md:min-h-[520px]">
      <AutoRefresh seconds={pane?.kind === "direct" ? 60 : 20} />
      {!session && <Notice tone="status" className="m-3 text-sm font-normal md:text-base"><strong>{t("guestTitle")}</strong> <span className="md:hidden">{t("guestTextShort")}</span><span className="max-md:hidden">{t("guestText")}</span> <Link href="/login?next=/friends" className="font-bold text-ink underline">{t("signIn")}</Link></Notice>}
      <div className="flex min-h-0 flex-1 flex-col bg-surface md:flex-row">
        <section id="chat-list" aria-label={t("conversations")} className={`${paneOpen ? "hidden md:flex" : "flex"} min-h-0 w-full flex-1 flex-col overflow-y-auto border-line md:w-[340px] md:flex-none md:border-r lg:w-[380px]`}>
          <div className="flex flex-none items-center justify-between gap-2 px-4 pb-1 pt-4">
            <h1 className="m-0 text-[22px] font-bold leading-tight">{filter === "all" ? t("title") : t(`filter.${filter}`)}</h1>
            {session && <Link href="/new/group" aria-label={t("newGroup")} title={t("newGroup")} className={btn.secondarySm}><IconPlus size={14} /> {t("newGroupShort")}</Link>}
          </div>
          {session && (
            // Phones only: on wide screens the sidebar holds these as sections.
            <div role="group" aria-label={t("filter.label")} className="flex flex-none gap-1.5 overflow-x-auto px-4 py-2 md:hidden">
              {FILTERS.map((f) => (
                <Link key={f} href={href({ f, c: "" })} aria-pressed={filter === f}
                  className={`inline-flex h-8 flex-none items-center gap-1 px-3 text-sm no-underline ${filter === f ? "bg-ink font-bold text-on-ink" : "bg-chip text-ink"}`}>
                  {t(`filter.${f}`)}
                  {counts[f] > 0 && <span className={`inline-flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-bold leading-none ${filter === f ? "bg-on-ink text-ink" : "bg-ink text-on-ink"}`}>{counts[f]}</span>}
                </Link>
              ))}
            </div>
          )}
          {/* Search on the left, order on the right. */}
          <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2 md:px-4">
            <ListSearch listId="chat-list" value={s} label={t("listSearch")}
              keep={{ ...(mode !== "chrono" ? { mode } : {}), ...(filter !== "all" ? { f: filter } : {}) }} />
            <Popover align="right" label={<>{te("sort")} <span className="font-normal">{t(`mode.${mode}`)}</span></>}>
              <div className="flex flex-col" role="group" aria-label={t("order")}>
                {(["chrono", "suggested"] as const).map((m) => (
                  <Link key={m} href={href({ mode: m })} aria-current={mode === m ? "true" : undefined}
                    className={`flex h-10 items-center justify-between border-b border-line text-ink no-underline last:border-b-0 ${mode === m ? "font-bold" : ""}`}>
                    {t(`mode.${m}`)}{mode === m && <IconCheck size={12} />}
                  </Link>
                ))}
              </div>
            </Popover>
          </div>
          {shown.map((r) => (
            // Two lines like the marketplace: name and time, then the latest message (or what it is about).
            <Link key={r.key} href={r.kind === "group" ? `/friends/g/${r.key.slice(2)}${(() => { const q = href({ c: "" }).split("?")[1]; return q ? `?${q}` : ""; })()}` : href({ c: r.key })} aria-current={sel === r.key ? "true" : undefined} data-search={[r.name, r.sub, r.preview ?? ""].join(" ").toLowerCase()}
              className={`flex items-center gap-3 border-b border-line px-3 py-2 text-ink no-underline md:px-4 md:py-3 ${sel === r.key ? "bg-paper" : ""}`}>
              <Avatar name={r.name} seed={r.seed} path={r.path} size={40} group={r.groupAvatar ?? r.kind === "group"} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline justify-between gap-2"><strong className="truncate">{r.name}</strong>{r.at && <span className="flex-none text-xs text-muted">{relTime(r.at, locale)}</span>}</span>
                {(r.kind === "direct" || r.kind === "group") && r.preview ? <span className={`truncate text-sm ${r.unread ? "font-bold" : "text-muted"}`}>{r.preview}</span>
                  : <span className="truncate text-sm text-muted">{r.sub}</span>}
              </span>
              {r.unread > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center self-center bg-ink px-1 text-xs font-bold text-on-ink" aria-label={t("unread", { n: r.unread })}>{r.unread}</span>}
              {r.tag && <span className={`self-center whitespace-nowrap px-1.5 py-0.5 text-xs font-bold ${r.tag === t("req.newTag") ? "bg-red text-on-red" : "border border-line-strong"}`}>{r.tag}</span>}
            </Link>
          ))}
          <p data-search-none hidden={!(s && shown.length === 0)} className="m-0 px-4 py-6 text-sm text-muted">{t("listNone")}</p>
          {!s && session && shown.length === 0 && (
            <p className="m-0 px-4 py-6 text-sm text-muted">{hasAnything || filter !== "all" ? t("emptyFilter") : t("emptyList")}</p>
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
        <section aria-label={t("pane")} className={`${paneOpen ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-paper px-3 py-2 md:px-6 md:py-4`}>
          {(!pane || pane.kind === "request") && <Link href={href({ c: "" })} className="mb-2 inline-flex items-center gap-1 text-sm text-ink md:hidden"><IconBack size={14} /> {t("back")}</Link>}
          {(pane?.kind === "group" || pane?.kind === "listing") && (
            // A group with its tabs and tools, or a listing, scrolls on its own next to the list.
            <div className="-mx-3 -my-2 min-h-0 flex-1 overflow-y-auto md:-mx-6 md:-my-4">
              <BackToList href={href({ c: "" })} label={t("back")} />
              {pane.kind === "group"
                ? <GroupView slug={pane.slug} sp={sp} base={`/friends/g/${pane.slug}`} embedded first="talk" />
                : <ListingDetail id={pane.id} embedded />}
            </div>
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
                      ? <Link href={`/listings/${pane.listing_id}`} className="text-muted">{t("about", { title: pane.title })}</Link>
                      : t("about", { title: pane.title })}</span>
                    : <span className="text-sm text-muted">{t("private", { title: "" }).replace(/ · $/, "")}</span>}
                </div>
                <Link href={`/new/group?with=${pane.other_id}`} className={`${btn.secondarySm} max-sm:hidden`} title={t("toolsWithText", { name: pane.other.split(" ")[0] })}>{t("toolsWith")}</Link>
                <ChatMenu conversationId={pane.id} otherId={pane.other_id} otherName={pane.other.split(" ")[0]} muted={pane.muted} blocked={pane.blocked}
                  ttl={{ days: pane.ttl_days, proposedDays: pane.ttl_proposed_days, proposedByMe: pane.ttl_by_me }} />
              </header>
              {pane.blocked && <Notice tone="status" className="flex-none text-sm font-normal">{ts("chat.blockedNote", { name: pane.other.split(" ")[0] })}</Notice>}
              <Conversation key={pane.id} id={pane.id} initial={pane.messages} viewerId={me} otherName={pane.other.split(" ")[0]} otherReadAt={pane.other_read_at} verified={!!session?.profile.verified} asOf={pane.as_of} />
            </>
          )}
          {pane?.kind === "request" && <div className="min-h-0 flex-1 overflow-y-auto"><RequestPane key={pane.request.id} r={pane.request} /></div>}
          {!pane && (
            <div className="m-auto flex max-w-[420px] flex-col items-center gap-3 text-center">
              <AreaIcon area="friends" size={72} />
              <p className="m-0 text-muted">{t("pick")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
