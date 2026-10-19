import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer, type Tx } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { relTime } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { Glyph } from "@/components/ui/Glyph";
import { MarkAllRead } from "@/components/MarkAllRead";

export async function generateMetadata() {
  return { title: (await getTranslations("notifications"))("title") };
}

type N = { id: string; kind: string; payload: Record<string, string | null>; read_at: string | null; created_at: string };
type Person = { name: string; seed: number; path: string | null };
type Item = {
  id: string; unread: boolean; at: string | Date; href: string; title: string; body: string; label: string; category: Category;
  person?: Person; glyph: string; extra?: string;
};
type Category = "messages" | "requests" | "other";

const FILTERS = ["all", "messages", "requests", "other"] as const;

const GLYPH: Record<string, string> = {
  join_request: "flower", join_accepted: "flower", join_declined: "flower", goal_vote: "flower", goal_adopted: "flower", goal_rejected: "flower", working_group: "flower",
  initiative_vote: "arch", initiative_passed: "arch", initiative_failed: "arch",
  request_answered: "lupe", request_forwarded: "lupe", responsibility_request: "lupe",
  post_reply: "bubble", jury_invite: "keyhole", report_decided: "split", content_hidden: "split",
};

/** What a notification needs besides its own payload: names, previews, unread counts. */
async function context(tx: Tx, me: string, rows: N[]) {
  const ids = (kinds: string[], key: string) => rows.filter((n) => kinds.includes(n.kind) && n.payload[key]).map((n) => n.payload[key] as string);
  const convIds = ids(["message"], "conversation_id");
  const reqIds = ids(["contact_request", "contact_accepted", "contact_declined"], "request_id");
  const groupIds = ids(["join_request"], "group_id");
  const chats = convIds.length ? await tx<{ id: string; title: string | null; other_name: string; other_seed: number; other_path: string | null; unread: number; preview: string | null; at: string }[]>`
    select c.id, c.title, op.display_name as other_name, op.avatar_seed as other_seed, op.avatar_path as other_path,
           (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id <> ${me} and m.created_at > mine.last_read_at) as unread,
           (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as preview,
           c.last_message_at as at
    from public.conversations c
    join public.conversation_participants mine on mine.conversation_id = c.id and mine.profile_id = ${me}
    join public.conversation_participants o on o.conversation_id = c.id and o.profile_id <> ${me}
    join public.profiles op on op.id = o.profile_id
    where c.id = any(${convIds}::uuid[])` : [];
  const requests = reqIds.length ? await tx<{ id: string; message: string; title: string | null; status: string; other_name: string; other_seed: number; other_path: string | null; conversation_id: string | null }[]>`
    select r.id, r.message, l.title, r.status::text, op.display_name as other_name, op.avatar_seed as other_seed, op.avatar_path as other_path,
           (select v.id from public.conversations v where v.contact_request_id = r.id) as conversation_id
    from public.contact_requests r
    join public.profiles op on op.id = case when r.from_profile_id = ${me} then r.to_profile_id else r.from_profile_id end
    left join public.listings l on l.id = r.listing_id
    where r.id = any(${reqIds}::uuid[])` : [];
  const joins = groupIds.length ? await tx<{ group_id: string; id: string; message: string | null; name: string; seed: number; path: string | null }[]>`
    select distinct on (j.group_id) j.group_id, j.id, j.message, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path
    from public.group_join_requests j join public.profiles p on p.id = j.profile_id
    where j.group_id = any(${groupIds}::uuid[]) and j.status = 'pending'
    order by j.group_id, j.created_at desc` : [];
  return { chats: new Map(chats.map((c) => [c.id, c])), requests: new Map(requests.map((r) => [r.id, r])), joins: new Map(joins.map((j) => [j.group_id, j])) };
}

export default async function Notifications({ searchParams }: PageProps<"/notifications">) {
  const sp = await searchParams;
  const session = await requireSession("/notifications");
  const t = await getTranslations("notifications");
  const locale = await getLocale();
  const me = session.profile.id;
  const filter = (FILTERS as readonly string[]).includes(String(sp.f)) ? (sp.f as (typeof FILTERS)[number]) : "all";

  const { rows, ctx } = await asViewer({ authId: session.authId, profileId: me }, async (tx) => {
    const rows = await tx<N[]>`select id, kind, payload, read_at, created_at from public.notifications where profile_id = ${me} order by created_at desc limit 100`;
    const ctx = await context(tx, me, rows);
    // Seeing a notice counts as read. Chat notices clear when the chat is opened.
    await tx`update public.notifications set read_at = now() where profile_id = ${me} and read_at is null and kind <> 'message'`;
    return { rows, ctx };
  });

  const items: Item[] = [];
  for (const n of rows) {
    const p = n.payload;
    const unread = !n.read_at;
    const at = n.created_at;
    if (n.kind === "message") {
      const c = ctx.chats.get(p.conversation_id ?? "");
      if (!c || (c.unread === 0 && !unread)) continue;
      if (c.unread === 0) continue;
      items.push({
        id: n.id, unread: true, at: c.at, href: `/connect?c=d:${p.conversation_id}`, category: "messages", glyph: "bubble",
        title: t("items.message.title", { name: c.other_name }), body: c.preview ?? "", label: t("labels.message"),
        extra: [t("unreadN", { n: c.unread }), c.title].filter(Boolean).join(" · "), person: { name: c.other_name, seed: c.other_seed, path: c.other_path },
      });
      continue;
    }
    let kind = n.kind;
    let values: Record<string, string> = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ""]));
    let href = "/connect";
    let person: Person | undefined;
    let category: Category = "other";
    let label = t("labels.other");
    if (kind === "contact_request" || kind === "contact_accepted" || kind === "contact_declined") {
      const r = ctx.requests.get(p.request_id ?? "");
      const direct = !(p.title ?? r?.title);
      if (direct) kind = `${kind}_direct`;
      values = { ...values, name: r?.other_name ?? "?", title: p.title ?? r?.title ?? "", message: r?.message ?? "" };
      person = r ? { name: r.other_name, seed: r.other_seed, path: r.other_path } : undefined;
      href = n.kind === "contact_accepted" && (p.conversation_id ?? r?.conversation_id) ? `/connect?c=d:${p.conversation_id ?? r?.conversation_id}` : p.request_id ? `/connect?c=c:${p.request_id}` : "/connect?f=requests";
      category = "requests"; label = t("labels.request");
    } else if (kind === "join_request") {
      const j = ctx.joins.get(p.group_id ?? "");
      values = { ...values, name: j?.name ?? "?", message: j?.message ?? "" };
      person = j ? { name: j.name, seed: j.seed, path: j.path } : undefined;
      href = j ? `/connect?c=j:${j.id}` : `/groups/${p.slug}?tab=team`;
      category = "requests"; label = t("labels.group");
    } else if (kind === "join_accepted" || kind === "join_declined") {
      href = `/groups/${p.slug}`; category = "requests"; label = t("labels.group");
    } else if (["goal_vote", "goal_adopted", "goal_rejected", "working_group"].includes(kind)) {
      href = `/groups/${p.slug}`; label = t("labels.group");
    } else if (kind.startsWith("initiative_")) {
      href = `/initiatives/${p.initiative_id}${kind === "initiative_vote" ? "?tab=vote" : ""}`; label = t("labels.initiative");
    } else if (kind === "request_answered" || kind === "request_forwarded") {
      href = p.initiative_id ? `/initiatives/${p.initiative_id}` : "/responsible"; label = t("labels.request");
    } else if (kind === "responsibility_request") {
      href = "/responsible?view=intake"; category = "requests"; label = t("labels.request");
    } else if (kind === "post_reply") {
      href = p.group_id ? "/connect" : p.initiative_id ? `/initiatives/${p.initiative_id}?tab=threads` : "/connect";
    } else if (kind === "jury_invite") {
      href = `/jury/${p.case_id}`; label = t("labels.jury");
    } else if (kind === "vouched") {
      href = "/rechte";
    } else if (kind === "post_removed") {
      href = p.slug ? `/groups/${p.slug}?tab=talk` : "/connect"; label = t("labels.group");
    } else if (kind === "ttl_proposed") {
      href = `/connect?c=d:${p.conversation_id}`; category = "messages"; label = t("labels.message");
    } else if (kind === "report_decided" || kind === "content_hidden") {
      href = "/me?tab=reports"; label = t("labels.jury");
    }
    const known = t.has(`items.${kind}.title`);
    const key = known ? kind : "fallback";
    items.push({
      id: n.id, unread, at, href, category, label, person, glyph: GLYPH[n.kind] ?? "circle",
      title: t(`items.${key}.title`, values), body: t(`items.${key}.body`, values),
    });
  }

  const counts = { all: items.length, messages: 0, requests: 0, other: 0 };
  for (const i of items) counts[i.category]++;
  const shown = items.filter((i) => filter === "all" || i.category === filter);
  const fresh = shown.filter((i) => i.unread);
  const earlier = shown.filter((i) => !i.unread);
  const hasUnread = items.some((i) => i.unread);

  const Row = ({ i }: { i: Item }) => (
    <Link href={i.href} className="flex items-start gap-3 border-b border-line py-4 text-ink no-underline">
      {i.person
        ? <Avatar name={i.person.name} seed={i.person.seed} path={i.person.path} size={44} />
        : <span className="inline-flex h-11 w-11 flex-none items-center justify-center bg-chip"><Glyph shape={i.glyph} size={24} color="var(--ink)" /></span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <strong className={`truncate ${i.unread ? "" : "font-semibold"}`}>{i.title}</strong>
          <span className="flex-none text-xs text-muted">{relTime(i.at, locale)}</span>
        </span>
        {i.body && <span className={`line-clamp-2 break-words ${i.unread ? "" : "text-muted"}`}>{i.body}</span>}
        <span className="text-xs text-muted">{[i.label, i.extra].filter(Boolean).join(" · ")}</span>
      </span>
      {i.unread && <span aria-label={t("sections.new")} className="mt-1.5 h-2.5 w-2.5 flex-none bg-red" />}
    </Link>
  );

  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-4 pb-6 pt-4 md:gap-5 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display m-0">{t("title")}</h1>
        {hasUnread && <MarkAllRead label={t("markAll")} />}
      </div>
      <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f} href={f === "all" ? "/notifications" : `/notifications?f=${f}`} aria-pressed={filter === f}
            className={`inline-flex h-8 items-center gap-1.5 px-3 text-[13px] no-underline ${filter === f ? "bg-ink font-bold text-on-ink" : "bg-chip text-ink"}`}>
            {t(`filter.${f}`)}
            {counts[f] > 0 && f !== "all" && <span className={`inline-flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-bold ${filter === f ? "bg-on-ink text-ink" : "bg-ink text-on-ink"}`}>{counts[f]}</span>}
          </Link>
        ))}
      </div>
      {shown.length === 0 && <p className="m-0 text-muted">{items.length === 0 ? t("empty") : t("emptyFilter")}</p>}
      {fresh.length > 0 && (
        <section className="flex flex-col">
          <h2 className="m-0 border-b-2 border-ink pb-2 text-sm font-bold">{t("sections.new")} · {fresh.length}</h2>
          {fresh.map((i) => <Row key={i.id} i={i} />)}
        </section>
      )}
      {earlier.length > 0 && (
        <section className="flex flex-col">
          <h2 className="m-0 border-b-2 border-line pb-2 text-sm font-bold text-muted">{t("sections.earlier")}</h2>
          {earlier.map((i) => <Row key={i.id} i={i} />)}
        </section>
      )}
    </div>
  );
}
