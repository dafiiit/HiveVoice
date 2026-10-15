import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts } from "@/lib/posts";
import { myMunicipality } from "@/lib/queries";
import { relTime } from "@/lib/format";
import type { Message } from "@/lib/actions/messages";
import { Avatar } from "@/components/ui/Avatar";
import { Composer, PostList } from "@/components/PostList";
import { Conversation } from "@/components/connect/Conversation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { IconBack } from "@/components/ui/Icons";

export async function generateMetadata() {
  return { title: (await getTranslations("connect"))("title") };
}

type Row = { key: string; name: string; kind: "market" | "group" | "direct" | "suggestion"; sub: string; preview: string | null; at: string | null; unread: number; seed?: number };

export default async function Connect({ searchParams }: PageProps<"/connect">) {
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("connect");
  const locale = await getLocale();
  const mode = sp.mode === "suggested" ? "suggested" : "chrono";
  const sel = typeof sp.c === "string" ? sp.c : "market";
  const sort = sp.sort === "new" ? "new" : "top";

  const data = await asViewer(viewer, async (tx) => {
    const muni = await myMunicipality(tx, me ?? undefined);
    const groups = me ? await tx<{ id: string; slug: string; name: string; member_count: number; preview: string | null; author: string | null; at: string | null }[]>`
      select g.id, g.slug::text, g.name, g.member_count,
        (select p.body from public.posts p where p.group_id = g.id and p.parent_id is null and p.hidden_at is null order by p.created_at desc limit 1) as preview,
        (select a.display_name from public.posts p join public.profiles a on a.id = p.author_id where p.group_id = g.id and p.parent_id is null order by p.created_at desc limit 1) as author,
        (select max(p.created_at) from public.posts p where p.group_id = g.id) as at
      from public.group_members m join public.groups g on g.id = m.group_id where m.profile_id = ${me} order by at desc nulls last` : [];
    const directs = me ? await tx<{ id: string; title: string | null; other: string; other_seed: number; preview: string | null; at: string; unread: number }[]>`
      select c.id, c.title, op.display_name as other, op.avatar_seed as other_seed, c.last_message_at as at,
        (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as preview,
        (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id <> ${me} and m.created_at > mine.last_read_at) as unread
      from public.conversations c
      join public.conversation_participants mine on mine.conversation_id = c.id and mine.profile_id = ${me}
      join public.conversation_participants o on o.conversation_id = c.id and o.profile_id <> ${me}
      join public.profiles op on op.id = o.profile_id
      order by c.last_message_at desc` : [];
    const suggestions = mode === "suggested" ? await tx<{ slug: string; name: string; member_count: number; why: string | null }[]>`
      select g.slug::text, g.name, g.member_count,
        (select t.slug::text from public.group_tags gt join public.tags t on t.id = gt.tag_id
         join public.user_interests ui on ui.tag_id = gt.tag_id and ui.profile_id = ${me} where gt.group_id = g.id limit 1) as why
      from public.groups g where g.visibility = 'public' and g.archived_at is null and ${me ? tx`app.group_role(g.id) is null` : tx`true`}
      order by (exists (select 1 from public.group_tags gt join public.user_interests ui on ui.tag_id = gt.tag_id and ui.profile_id = ${me} where gt.group_id = g.id)) desc,
               g.member_count desc limit 6` : [];

    let pane: { kind: "market"; posts: Awaited<ReturnType<typeof loadPosts>> } | { kind: "group"; group: { id: string; slug: string; name: string; member_count: number; can_post: boolean }; posts: Awaited<ReturnType<typeof loadPosts>> } | { kind: "direct"; id: string; other: string; other_id: string; title: string | null; messages: Message[] } | null = null;
    if (sel === "market") {
      const regionIds = muni ? [muni.id] : (await tx<{ id: string }[]>`select id from public.regions where level = 'municipality' and id in (select distinct region_id from public.posts where region_id is not null) limit 50`).map((r) => r.id);
      pane = { kind: "market", posts: await loadPosts(tx, { regionIds }, me, { sort }) };
    } else if (sel.startsWith("g:")) {
      const [g] = await tx<{ id: string; slug: string; name: string; member_count: number; can_post: boolean }[]>`
        select g.id, g.slug::text, g.name, g.member_count, app.has_group_permission(g.id, 'post') as can_post from public.groups g where g.slug = ${sel.slice(2)}`;
      if (g) pane = { kind: "group", group: g, posts: await loadPosts(tx, { groupId: g.id }, me) };
    } else if (sel.startsWith("d:") && me) {
      const id = sel.slice(2);
      const [c] = await tx<{ id: string; title: string | null; other: string; other_id: string }[]>`
        select c.id, c.title, op.display_name as other, op.id as other_id from public.conversations c
        join public.conversation_participants o on o.conversation_id = c.id and o.profile_id <> ${me}
        join public.profiles op on op.id = o.profile_id where c.id = ${id}`;
      if (c) {
        const messages = await tx<Message[]>`
          select m.id, m.body, m.created_at, m.sender_id, p.display_name as sender_name, p.avatar_seed as sender_seed
          from public.messages m join public.profiles p on p.id = m.sender_id where m.conversation_id = ${id} order by m.created_at`;
        await tx`update public.conversation_participants set last_read_at = now() where conversation_id = ${id} and profile_id = ${me}`;
        await tx`update public.notifications set read_at = now() where profile_id = ${me} and kind = 'message' and read_at is null and payload ->> 'conversation_id' = ${id}`;
        pane = { kind: "direct", ...c, messages };
      }
    }
    return { muni, groups, directs, suggestions, pane };
  });

  const rows: Row[] = [
    { key: "market", name: t("market"), kind: "market", sub: data.muni ? t("marketSub", { place: data.muni.name }) : t("marketSubAll"), preview: null, at: null, unread: 0 },
    ...data.directs.map((d) => ({ key: `d:${d.id}`, name: d.other, kind: "direct" as const, sub: t("private", { title: d.title ?? "" }), preview: d.preview, at: d.at, unread: d.unread, seed: d.other_seed })),
    ...data.groups.map((g) => ({ key: `g:${g.slug}`, name: g.name, kind: "group" as const, sub: t("groupSub", { n: g.member_count }), preview: g.preview ? `${g.author?.split(" ")[0]}: ${g.preview}` : null, at: g.at, unread: 0 })),
  ];
  if (mode === "chrono") rows.sort((a, b) => (a.kind === "market" ? -1 : b.kind === "market" ? 1 : (b.at ?? "").localeCompare(a.at ?? "")));
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ c: sel, mode, ...patch });
    if (p.get("mode") === "chrono") p.delete("mode");
    return `/connect?${p}`;
  };
  const pane = data.pane;
  const paneOpen = typeof sp.c === "string";

  return (
    <div className="flex flex-col gap-4 px-0 pb-8 pt-6 md:px-10 md:pb-12 md:pt-10">
      <AutoRefresh seconds={pane?.kind === "direct" ? 60 : 20} />
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 md:px-0">
        <h1 className="display m-0">{t("title")}</h1>
        <div role="group" aria-label={t("order")} className="flex gap-4">
          {(["chrono", "suggested"] as const).map((m) => (
            <Link key={m} href={href({ mode: m })} aria-pressed={mode === m} className={`pb-1 text-ink no-underline ${mode === m ? "border-b-[3px] border-ink font-bold" : "text-muted"}`}>{t(`mode.${m}`)}</Link>
          ))}
        </div>
      </div>
      {!session && <p className="m-0 border-l-4 border-ink bg-surface px-4 py-3 md:mx-0"><strong>{t("guestTitle")}</strong> {t("guestText")} <Link href="/login?next=/connect" className="font-bold">{t("signIn")}</Link></p>}
      <div className="flex min-h-[70dvh] flex-col border-y border-line bg-surface lg:flex-row lg:border">
        <section aria-label={t("conversations")} className={`${paneOpen ? "hidden lg:flex" : "flex"} w-full flex-none flex-col border-line lg:w-[340px] lg:border-r`}>
          {rows.map((r) => (
            <Link key={r.key} href={href({ c: r.key })} aria-current={sel === r.key ? "true" : undefined}
              className={`flex gap-3 border-b border-line px-4 py-3 text-ink no-underline ${sel === r.key ? "bg-paper" : ""}`}>
              <Avatar name={r.name} seed={r.seed} size={44} group={r.kind !== "direct"} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex justify-between gap-2"><strong className="truncate">{r.name}</strong>{r.at && <span className="flex-none text-xs text-muted">{relTime(r.at, locale)}</span>}</span>
                <span className="text-xs text-muted">{r.kind === "market" ? `${t("pinned")} · ` : ""}{r.sub}</span>
                {r.preview && <span className={`truncate text-sm ${r.unread ? "font-bold" : "text-muted"}`}>{r.preview}</span>}
              </span>
              {r.unread > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center self-center bg-ink px-1 text-xs font-bold text-on-ink" aria-label={t("unread", { n: r.unread })}>{r.unread}</span>}
            </Link>
          ))}
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
        <section aria-label={t("pane")} className={`${paneOpen ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col px-4 py-4 md:px-6`}>
          <Link href="/connect" className="mb-2 inline-flex items-center gap-1 text-sm text-ink lg:hidden"><IconBack size={14} /> {t("back")}</Link>
          {pane?.kind === "market" && (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex flex-col"><strong className="text-lg">{t("market")}</strong><span className="text-sm text-muted">{data.muni ? t("marketOpen", { place: data.muni.name }) : t("marketSubAll")}</span></div>
                <div className="flex gap-3 text-sm">
                  {(["top", "new"] as const).map((s) => <Link key={s} href={href({ sort: s })} className={sort === s ? "font-bold text-ink" : "text-muted"}>{t(`sort.${s}`)}</Link>)}
                </div>
              </header>
              {session && data.muni ? <div className="py-3"><Composer ctx={{ regionId: data.muni.id }} path="/connect" placeholder={t("marketPlaceholder")} viewerName={session.profile.display_name} viewerSeed={session.profile.avatar_seed} /></div>
                : !session && <p className="m-0 py-3 text-sm text-muted">{t("readOnly")}</p>}
              <PostList posts={pane.posts} path="/connect" canWrite={!!session?.profile.verified} viewerId={me ?? undefined} empty={t("marketEmpty")} />
            </>
          )}
          {pane?.kind === "group" && (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <Link href={`/groups/${pane.group.slug}`} className="flex flex-col text-ink no-underline"><strong className="text-lg">{pane.group.name}</strong><span className="text-sm text-muted">{t("groupSub", { n: pane.group.member_count })}</span></Link>
                <Link href={`/groups/${pane.group.slug}`} className="text-sm font-bold text-ink">{t("openGroup")}</Link>
              </header>
              {pane.group.can_post && <div className="py-3"><Composer ctx={{ groupId: pane.group.id }} path="/connect" placeholder={t("groupPlaceholder", { name: pane.group.name })} viewerName={session?.profile.display_name} viewerSeed={session?.profile.avatar_seed} /></div>}
              <PostList posts={pane.posts} path="/connect" canWrite={pane.group.can_post} viewerId={me ?? undefined} empty={t("groupEmpty")} />
            </>
          )}
          {pane?.kind === "direct" && me && (
            <>
              <header className="flex flex-col border-b border-line pb-3">
                <Link href={`/profile/${pane.other_id}`} className="text-lg font-bold text-ink no-underline">{pane.other}</Link>
                <span className="text-sm text-muted">{t("private", { title: pane.title ?? "" })}</span>
              </header>
              <Conversation id={pane.id} initial={pane.messages} viewerId={me} otherName={pane.other.split(" ")[0]} />
            </>
          )}
          {!pane && <p className="m-0 text-muted">{t("pick")}</p>}
        </section>
      </div>
    </div>
  );
}
