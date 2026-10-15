import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { initiativeCardColumns, initiativeCardFrom, myRegionIds, regionTree, type InitiativeCard as Card } from "@/lib/queries";
import { getPlace } from "@/lib/place";
import { InitiativeCard } from "@/components/InitiativeCard";
import { Avatar } from "@/components/ui/Avatar";
import { IconCheck } from "@/components/ui/Icons";
import { chip, tab, tag } from "@/components/ui/styles";
import { FollowButton } from "@/components/FollowButton";
import { LinkCard } from "@/components/links/LinkCard";
import { resourceColumns, resourceFrom, type ResourceRow } from "@/lib/links/queries";
import { btn } from "@/components/ui/styles";
import { Popover } from "@/components/ui/Popover";

export async function generateMetadata() {
  return { title: (await getTranslations("explore"))("title") };
}

const KINDS = ["initiatives", "groups", "people", "responsible", "links"] as const;
const RKINDS = ["document", "sheet", "slides", "form", "folder", "file", "pdf", "image", "video", "code", "design", "map", "dataset", "page"] as const;
const LEVELS = ["all", "borough", "municipality", "district", "state", "country"] as const;
const SORTS = ["relevant", "new", "soon", "support"] as const;

type Group = { id: string; slug: string; name: string; summary: string | null; member_count: number; join_policy: string; region_name: string | null; tags: string[]; is_member: boolean };
type Person = { id: string; display_name: string; avatar_seed: number; avatar_path: string | null; headline: string | null; region_name: string | null; offers: string[]; needs: string[]; following: boolean };
type Resp = { id: string; title: string; organization_name: string | null; description: string; is_official: boolean; holder_name: string; holder_seed: number; region_name: string | null; avg_response_days: number | null };

export default async function Explore({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const kind = (KINDS as readonly string[]).includes(str("kind")) ? (str("kind") as (typeof KINDS)[number]) : "initiatives";
  const level = (LEVELS as readonly string[]).includes(str("level")) ? str("level") : "all";
  const sort = (SORTS as readonly string[]).includes(str("sort")) ? str("sort") : "relevant";
  const mine = str("mine") === "1";
  const q = str("q").trim();
  const rk = (RKINDS as readonly string[]).includes(str("rk")) ? str("rk") : "";
  const placeId = /^[0-9a-f-]{36}$/.test(str("place")) ? str("place") : "";
  const qq = q.replace(/^#/, "").toLowerCase();
  const like = `%${qq}%`;

  const session = await getSession();
  const home = await getPlace();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const t = await getTranslations("explore");
  const tl = await getTranslations("levels");
  const tk = await getTranslations("links");

  const [filterPlace] = placeId ? await asViewer(null, (tx) => tx<{ id: string; name: string }[]>`select id, name from public.regions where id = ${placeId}`) : [];
  const data = await asViewer(viewer, async (tx) => {
    const regions = session ? await myRegionIds(tx, session.profile.id) : (home?.chain.map((r) => r.id) ?? []);
    const inPlace = (column: ReturnType<typeof tx>) => filterPlace ? tx`and ${column} in ${regionTree(tx, filterPlace.id)}` : tx``;
    if (kind === "links") {
      const order = sort === "new" ? tx`r.created_at desc` : tx`r.score desc, r.created_at desc`;
      return {
        links: await tx<ResourceRow[]>`
          select ${resourceColumns(tx, session?.profile.id ?? null)} from ${resourceFrom(tx)}
          where r.hidden_at is null
            ${rk ? tx`and r.kind = ${rk}` : tx``}
            ${q ? tx`and (lower(r.title) like ${like} or lower(coalesce(r.description, '')) like ${like} or r.host like ${like}
                     or exists (select 1 from public.resource_tags rt join public.tags t on t.id = rt.tag_id where rt.resource_id = r.id and t.slug like ${qq + "%"}))` : tx``}
            ${mine ? tx`and r.region_id = any(${regions}::uuid[])` : tx``}
            ${inPlace(tx`r.region_id`)}
          order by ${order} limit 60`,
      };
    }
    if (kind === "initiatives") {
      const order =
        sort === "new" ? tx`i.created_at desc`
        : sort === "soon" ? tx`(select min(b.closes_at) from public.ballots b where b.initiative_id = i.id and b.status = 'open') asc nulls last, i.created_at desc`
        : sort === "support" ? tx`i.support_count desc`
        : tx`(i.region_id = any(${regions}::uuid[])) desc, (i.outcome is null) desc, i.support_count + i.argument_count * 3 desc`;
      return {
        initiatives: await tx<Card[]>`
          select ${initiativeCardColumns(tx)} from ${initiativeCardFrom(tx)}
          where i.published_at is not null
            ${level !== "all" ? tx`and r.level = ${level}` : tx``}
            ${mine ? tx`and i.region_id = any(${regions}::uuid[])` : tx``}
            ${inPlace(tx`i.region_id`)}
            ${q ? tx`and (lower(i.title) like ${like} or lower(coalesce(i.summary, '')) like ${like} or lower(r.name) like ${like})` : tx``}
          order by ${order} limit 60`,
      };
    }
    if (kind === "groups") {
      return {
        groups: await tx<Group[]>`
          select g.id, g.slug, g.name, g.summary, g.member_count, g.join_policy, r.name as region_name,
                 coalesce((select array_agg(t.slug::text) from public.group_tags gt join public.tags t on t.id = gt.tag_id where gt.group_id = g.id), '{}') as tags,
                 app.group_role(g.id) is not null as is_member
          from public.groups g left join public.regions r on r.id = g.region_id
          where g.archived_at is null
            ${q ? tx`and (lower(g.name) like ${like} or lower(coalesce(g.summary, '')) like ${like})` : tx``}
            ${mine ? tx`and g.region_id = any(${regions}::uuid[])` : tx``}
            ${inPlace(tx`g.region_id`)}
          order by (g.region_id = any(${regions}::uuid[])) desc, g.member_count desc limit 60`,
      };
    }
    if (kind === "people") {
      return {
        people: await tx<Person[]>`
          select p.id, p.display_name, p.avatar_seed, p.avatar_path, p.headline, r.name as region_name,
            coalesce((select array_agg(t.slug::text) from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = p.id and ui.relation = 'offers'), '{}') as offers,
            coalesce((select array_agg(t.slug::text) from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = p.id and ui.relation = 'needs'), '{}') as needs,
            ${viewer ? tx`exists (select 1 from public.follows f where f.follower_id = ${viewer.profileId} and f.target_type = 'profile' and f.target_id = p.id)` : tx`false`} as following
          from public.profiles p left join public.regions r on r.id = p.home_region_id
          where p.onboarded_at is not null ${viewer ? tx`and p.id <> ${viewer.profileId}` : tx``}
            ${inPlace(tx`p.home_region_id`)}
            ${q ? tx`and (lower(p.display_name) like ${like} or lower(coalesce(p.headline, '')) like ${like}
                     or exists (select 1 from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = p.id and t.slug like ${like}))` : tx``}
          order by p.helped_count desc, p.created_at desc limit 60`,
      };
    }
    return {
      responsible: await tx<Resp[]>`
        select s.id, s.title, s.organization_name, s.description, s.is_official, s.avg_response_days,
               p.display_name as holder_name, p.avatar_seed as holder_seed, r.name as region_name
        from public.responsibilities s join public.profiles p on p.id = s.holder_id left join public.regions r on r.id = s.region_id
        where true ${q ? tx`and (lower(s.title) like ${like} or lower(s.description) like ${like} or lower(coalesce(s.organization_name, '')) like ${like})` : tx``}
          ${mine ? tx`and s.region_id = any(${regions}::uuid[])` : tx``}
          ${inPlace(tx`s.region_id`)}
        order by s.is_official desc, (s.region_id = any(${regions}::uuid[])) desc, s.title limit 60`,
    };
  });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ kind, level, sort, q, rk, mine: mine ? "1" : "", place: filterPlace?.id ?? "", ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "level" && v === "all") || (k === "sort" && v === "relevant") || (k === "kind" && v === "initiatives")) p.delete(k);
    const s = p.toString();
    return `/explore${s ? `?${s}` : ""}`;
  };
  const count = data.initiatives?.length ?? data.groups?.length ?? data.people?.length ?? data.responsible?.length ?? data.links?.length ?? 0;

  return (
    <div className="flex flex-col gap-5 px-6 pb-12 pt-6 md:px-10 md:pb-20 md:pt-8">
      <h1 className="display m-0">{t("title")}</h1>
      <div role="tablist" aria-label={t("what")} className="flex overflow-x-auto border-b border-line">
        {KINDS.map((k) => (
          <Link key={k} role="tab" aria-selected={kind === k} href={href({ kind: k, level: "all", sort: "relevant", rk: "" })} className={tab(kind === k)}>{t(`kinds.${k}`)}</Link>
        ))}
      </div>
      <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
        {(kind === "initiatives" || kind === "links" || session) && (
          <Popover label={t("filter")} badge={(level !== "all" ? 1 : 0) + (mine ? 1 : 0) + (rk ? 1 : 0)}>
            {kind === "initiatives" && (
              <div className="flex flex-col gap-1.5" role="group" aria-label={t("level")}>
                <span className="text-[13px] font-bold">{t("level")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {LEVELS.map((l) => (
                    <Link key={l} href={href({ level: l })} aria-pressed={level === l} className={`${chip(level === l)} h-8 px-3 no-underline`}>{tl(l)}</Link>
                  ))}
                </div>
              </div>
            )}
            {kind === "links" && (
              <div className="flex flex-col gap-1.5" role="group" aria-label={tk("kindFilter")}>
                <span className="text-[13px] font-bold">{tk("kindFilter")}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={href({ rk: "" })} aria-pressed={!rk} className={`${chip(!rk)} h-8 px-3 no-underline`}>{tk("allKinds")}</Link>
                  {RKINDS.map((k) => <Link key={k} href={href({ rk: k })} aria-pressed={rk === k} className={`${chip(rk === k)} h-8 px-3 no-underline`}>{tk(`kinds.${k}`)}</Link>)}
                </div>
              </div>
            )}
            {session && (
              <Link href={href({ mine: mine ? "" : "1" })} className="inline-flex items-center gap-2 text-ink no-underline" aria-pressed={mine}>
                <span className={`inline-flex h-5 w-5 items-center justify-center border border-ink ${mine ? "bg-ink text-on-ink" : ""}`}>{mine && <IconCheck size={12} />}</span>
                {kind === "initiatives" ? t("canVote") : t("nearMe")}
              </Link>
            )}
          </Popover>
        )}
        {kind === "initiatives" && (
          <Popover label={<>{t("sort")} <span className="font-normal">{t(`sorts.${sort as "relevant"}`)}</span></>}>
            <div className="flex flex-col" role="group" aria-label={t("sort")}>
              {SORTS.map((s) => (
                <Link key={s} href={href({ sort: s })} aria-current={sort === s ? "true" : undefined}
                  className={`flex h-10 items-center justify-between border-b border-line text-ink no-underline last:border-b-0 ${sort === s ? "font-bold" : ""}`}>
                  {t(`sorts.${s}`)}{sort === s && <IconCheck size={12} />}
                </Link>
              ))}
            </div>
          </Popover>
        )}
        {kind === "links" && (
          <Popover label={<>{t("sort")} <span className="font-normal">{tk(`sort.${sort === "new" ? "new" : "popular"}`)}</span></>}>
            <div className="flex flex-col" role="group" aria-label={t("sort")}>
              {(["relevant", "new"] as const).map((s) => (
                <Link key={s} href={href({ sort: s })} aria-current={(sort === "new" ? "new" : "relevant") === s ? "true" : undefined}
                  className={`flex h-10 items-center justify-between border-b border-line text-ink no-underline last:border-b-0 ${(sort === "new" ? "new" : "relevant") === s ? "font-bold" : ""}`}>
                  {tk(`sort.${s === "new" ? "new" : "popular"}`)}{(sort === "new" ? "new" : "relevant") === s && <IconCheck size={12} />}
                </Link>
              ))}
            </div>
          </Popover>
        )}
        {rk && kind === "links" && <Link href={href({ rk: "" })} className={`${chip(true)} h-8 gap-1.5 px-2.5 no-underline`} aria-label={t("removeFilter", { what: tk(`kinds.${rk as "page"}`) })}>{tk(`kinds.${rk as "page"}`)} <span aria-hidden="true">✕</span></Link>}
        {level !== "all" && kind === "initiatives" && <Link href={href({ level: "all" })} className={`${chip(true)} h-8 gap-1.5 px-2.5 no-underline`} aria-label={t("removeFilter", { what: tl(level as "all") })}>{tl(level as "all")} <span aria-hidden="true">✕</span></Link>}
        {q && <Link href={href({ q: "" })} className={`${chip(true)} h-8 gap-1.5 px-2.5 no-underline`} aria-label={t("removeFilter", { what: q })}>{t("searchChip", { q })} <span aria-hidden="true">✕</span></Link>}
        {filterPlace && <Link href={href({ place: "" })} className={`${chip(true)} h-8 gap-1.5 px-2.5 no-underline`} aria-label={t("removeFilter", { what: filterPlace.name })}>{t("inPlace", { name: filterPlace.name })} <span aria-hidden="true">✕</span></Link>}
        {mine && <Link href={href({ mine: "" })} className={`${chip(true)} h-8 gap-1.5 px-2.5 no-underline`} aria-label={t("removeFilter", { what: kind === "initiatives" ? t("canVote") : t("nearMe") })}>{kind === "initiatives" ? t("canVote") : t("nearMe")} <span aria-hidden="true">✕</span></Link>}
        {kind === "links" && (
          <Link href={session ? "/new/link" : "/login?next=/new/link"} className={`${btn.primary} h-9 text-sm`}>+ {tk("share")}</Link>
        )}
        <span className="ml-auto text-muted">{t(`count.${kind}`, { n: count })}</span>
      </div>

      {count === 0 && kind !== "links" && <p className="m-0 border-t border-line pt-6 text-muted">{t("nothing")}</p>}
      {count === 0 && kind === "links" && (
        <div className="flex flex-col items-start gap-3 border-t border-line pt-6">
          <p className="m-0 text-muted">{q || rk ? tk("emptySearch") : tk("empty")}</p>
          {q && <Link href={`/needs?title=${encodeURIComponent(q)}`} className="font-bold">{tk("ask")}</Link>}
          {q && <span className="text-sm text-muted">{tk("askText")}</span>}
        </div>
      )}

      {data.links && data.links.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.links.map((r) => <LinkCard key={r.id} r={r} me={session?.profile.id ?? null} canVote={!!session?.profile.verified} />)}
        </div>
      )}

      {data.initiatives && (
        <div className="grid gap-x-5 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
          {data.initiatives.map((it) => <InitiativeCard key={it.id} it={it} showArgs />)}
        </div>
      )}

      {data.groups && (
        <div className="flex flex-col border-t border-line">
          {data.groups.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-4 border-b border-line py-4">
              <Link href={`/groups/${g.slug}`} className="flex min-w-[240px] flex-1 items-center gap-3 text-ink no-underline">
                <Avatar name={g.name} size={56} group />
                <span className="flex min-w-0 flex-col">
                  <strong className="text-lg">{g.name}</strong>
                  <span className="text-sm text-muted">{t("groupMeta", { n: g.member_count, place: g.region_name ?? "–" })} · {t(`join.${g.join_policy}`)}</span>
                  {g.summary && <span className="text-sm">{g.summary}</span>}
                </span>
              </Link>
              <div className="flex flex-wrap gap-1.5">{g.tags.slice(0, 4).map((x) => <span key={x} className={tag}>#{x}</span>)}</div>
              {g.is_member && <span className="text-sm font-bold">{t("member")}</span>}
            </div>
          ))}
        </div>
      )}

      {data.people && (
        <div className="flex flex-col border-t border-line">
          {data.people.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 border-b border-line py-4">
              <Link href={`/profile/${p.id}`} className="flex min-w-[240px] flex-1 items-center gap-3 text-ink no-underline">
                <Avatar name={p.display_name} seed={p.avatar_seed} path={p.avatar_path} size={56} />
                <span className="flex min-w-0 flex-col">
                  <strong className="text-lg">{p.display_name}</strong>
                  <span className="text-sm text-muted">{[p.headline, p.region_name].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
              <div className="flex flex-wrap gap-1.5">
                {p.offers.slice(0, 3).map((x) => <span key={`o${x}`} className={tag}>#{t("offers")} {x}</span>)}
                {p.needs.slice(0, 2).map((x) => <span key={`n${x}`} className={tag}>#{t("needs")} {x}</span>)}
              </div>
              {session && <FollowButton type="profile" id={p.id} following={p.following} />}
            </div>
          ))}
          <span className="pt-3 text-sm text-muted">{t("followPrivate")}</span>
        </div>
      )}

      {data.responsible && (
        <div className="flex flex-col border-t border-line">
          {data.responsible.map((r) => (
            <Link key={r.id} href={`/responsible?id=${r.id}`} className="flex flex-wrap items-center gap-4 border-b border-line py-4 text-ink no-underline">
              <Avatar name={r.organization_name ?? r.holder_name} size={48} />
              <span className="flex min-w-[240px] flex-1 flex-col">
                <strong className="flex items-center gap-1.5 text-lg">
                  {r.organization_name ? `${r.organization_name} · ${r.title}` : r.title}
                  {r.is_official && <span title={t("official")} aria-label={t("official")} className="inline-flex"><IconCheck /></span>}
                </strong>
                <span className="text-sm">{r.description}</span>
                <span className="text-sm text-muted">{[r.holder_name, r.region_name, r.avg_response_days != null ? t("responds", { days: r.avg_response_days }) : null].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
