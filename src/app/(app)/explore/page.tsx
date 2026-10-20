import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { initiativeCardColumns, initiativeCardFrom, myRegionIds, regionTree, type InitiativeCard as Card } from "@/lib/queries";
import { getPlace } from "@/lib/place";
import { InitiativeCard } from "@/components/InitiativeCard";
import { Avatar } from "@/components/ui/Avatar";
import { IconCheck, IconPlus } from "@/components/ui/Icons";
import { chip, tag } from "@/components/ui/styles";
import { redirect } from "next/navigation";
import { Page, PageHeader, Toolbar, Notice } from "@/components/ui/Page";
import { ExploreTabs, EXPLORE_KINDS } from "@/components/ExploreTabs";
import { FollowButton } from "@/components/FollowButton";
import { LinkCard } from "@/components/links/LinkCard";
import { resourceColumns, resourceFrom, type ResourceRow } from "@/lib/links/queries";
import { btn } from "@/components/ui/styles";
import { Popover } from "@/components/ui/Popover";
import { MobileFinder } from "@/components/shell/MobileFinder";

export async function generateMetadata() {
  return { title: (await getTranslations("explore"))("title") };
}

const KINDS = EXPLORE_KINDS;
const RKINDS = ["document", "sheet", "slides", "form", "folder", "file", "pdf", "image", "video", "code", "design", "map", "dataset", "page", "note"] as const;
const LEVELS = ["all", "borough", "municipality", "district", "state", "country"] as const;
const SORTS = ["relevant", "new", "soon", "support"] as const;

type Group = { id: string; slug: string; name: string; summary: string | null; member_count: number; join_policy: string; region_name: string | null; tags: string[]; is_member: boolean };
type Person = { id: string; display_name: string; avatar_seed: number; avatar_path: string | null; headline: string | null; region_name: string | null; offers: string[]; needs: string[]; following: boolean };

export default async function Explore({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  // Offers and wanted posts moved to Anliegen, Zuständige have their own page; old links keep working.
  if (sp.kind === "market") {
    const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && !["kind", "side"].includes(k)) as [string, string][]);
    p.set("tab", sp.side === "need" ? "needs" : "offers");
    redirect(`/anliegen?${p}`);
  }
  if (sp.kind === "responsible") redirect(typeof sp.q === "string" ? `/responsible?q=${encodeURIComponent(sp.q)}` : "/responsible");
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
          where r.hidden_at is null and r.trashed_at is null and r.visibility in ('public', 'group')
            ${rk ? tx`and r.kind = ${rk}` : tx``}
            ${q ? tx`and (lower(r.title) like ${like} or lower(coalesce(r.description, '')) like ${like} or r.host like ${like} or lower(coalesce(r.body_md, '')) like ${like}
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
          where i.published_at is not null and i.blocked_at is null
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
      // Searching for names needs three letters and is limited per hour (so the member list cannot be scraped).
      const allowed = !q || (q.length >= 3 && (await tx<{ ok: boolean }[]>`select app.people_search_allowed() as ok`)[0].ok);
      return {
        people: await tx<Person[]>`
          select p.id, p.display_name, p.avatar_seed, p.avatar_path, p.headline, r.name as region_name,
            coalesce((select array_agg(t.slug::text) from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = p.id and ui.relation = 'offers'), '{}') as offers,
            coalesce((select array_agg(t.slug::text) from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = p.id and ui.relation = 'needs'), '{}') as needs,
            ${viewer ? tx`exists (select 1 from public.follows f where f.follower_id = ${viewer.profileId} and f.target_type = 'profile' and f.target_id = p.id)` : tx`false`} as following
          from public.profiles p left join public.regions r on r.id = p.home_region_id
          where p.onboarded_at is not null ${viewer ? tx`and p.id <> ${viewer.profileId}` : tx``}
            and app.can_find(${viewer?.profileId ?? null}::uuid, p.id) and ${allowed}
            ${inPlace(tx`p.home_region_id`)}
            ${q ? tx`and (lower(p.display_name) like ${like} or lower(coalesce(p.headline, '')) like ${like}
                     or exists (select 1 from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = p.id and t.slug like ${like}))` : tx``}
          order by p.helped_count desc, p.created_at desc limit 60`,
      };
    }
    return {};
  });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ kind, level, sort, q, rk, mine: mine ? "1" : "", place: filterPlace?.id ?? "", ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "level" && v === "all") || (k === "sort" && v === "relevant") || (k === "kind" && v === "initiatives")) p.delete(k);
    const s = p.toString();
    return `/explore${s ? `?${s}` : ""}`;
  };
  const count = data.initiatives?.length ?? data.groups?.length ?? data.people?.length ?? data.links?.length ?? 0;

  const create = kind === "initiatives" ? { href: "/new/initiative", label: t("create.initiatives") }
    : kind === "groups" ? { href: "/new/group", label: t("create.groups") }
    : kind === "links" ? { href: "/new/link", label: tk("share") } : null;
  return (
    <Page>
      <MobileFinder />
      <PageHeader title={t("title")} mobileHidden />
      <ExploreTabs active={kind} href={(k) => href({ kind: k, level: "all", sort: "relevant", rk: "" })} />
      <Toolbar count={t(`count.${kind}`, { n: count })}>
        {(kind === "initiatives" || kind === "links" || session) && (
          <Popover label={t("filter")} badge={(level !== "all" ? 1 : 0) + (mine ? 1 : 0) + (rk ? 1 : 0)}>
            {kind === "initiatives" && (
              <div className="flex flex-col gap-1.5" role="group" aria-label={t("level")}>
                <span className="text-[13px] font-bold">{t("level")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {LEVELS.map((l) => (
                    <Link key={l} href={href({ level: l })} aria-pressed={level === l} className={chip(level === l)}>{tl(l)}</Link>
                  ))}
                </div>
              </div>
            )}
            {kind === "links" && (
              <div className="flex flex-col gap-1.5" role="group" aria-label={tk("kindFilter")}>
                <span className="text-[13px] font-bold">{tk("kindFilter")}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={href({ rk: "" })} aria-pressed={!rk} className={chip(!rk)}>{tk("allKinds")}</Link>
                  {RKINDS.map((k) => <Link key={k} href={href({ rk: k })} aria-pressed={rk === k} className={chip(rk === k)}>{tk(`kinds.${k}`)}</Link>)}
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
        {rk && kind === "links" && <Link href={href({ rk: "" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: tk(`kinds.${rk as "page"}`) })}>{tk(`kinds.${rk as "page"}`)} <span aria-hidden="true">✕</span></Link>}
        {level !== "all" && kind === "initiatives" && <Link href={href({ level: "all" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: tl(level as "all") })}>{tl(level as "all")} <span aria-hidden="true">✕</span></Link>}
        {q && <Link href={href({ q: "" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: q })}>{t("searchChip", { q })} <span aria-hidden="true">✕</span></Link>}
        {filterPlace && <Link href={href({ place: "" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: filterPlace.name })}>{t("inPlace", { name: filterPlace.name })} <span aria-hidden="true">✕</span></Link>}
        {mine && <Link href={href({ mine: "" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: kind === "initiatives" ? t("canVote") : t("nearMe") })}>{kind === "initiatives" ? t("canVote") : t("nearMe")} <span aria-hidden="true">✕</span></Link>}
        {create && <Link href={session ? create.href : `/login?next=${create.href}`} className={btn.primarySm}><IconPlus size={14} /> {create.label}</Link>}
      </Toolbar>

      {count === 0 && kind !== "links" && <Notice tone="hint" className="border-t border-line pt-6 text-base">{t("nothing")}</Notice>}
      {count === 0 && kind === "links" && (
        <div className="flex flex-col items-start gap-3 border-t border-line pt-6">
          <p className="m-0 text-muted">{q || rk ? tk("emptySearch") : tk("empty")}</p>
          {q && <Link href={`/anliegen?as=need&title=${encodeURIComponent(q)}`} className={btn.secondarySm}>{tk("ask")}</Link>}
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
          {data.initiatives.map((it) => <InitiativeCard key={it.id} it={it} />)}
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
            <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-line py-4">
              <Link href={`/profile/${p.id}`} className="flex min-w-0 items-center gap-3 text-ink no-underline">
                <Avatar name={p.display_name} seed={p.avatar_seed} path={p.avatar_path} size={56} />
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate text-lg">{p.display_name}</strong>
                  <span className="truncate text-sm text-muted">{[p.headline, p.region_name].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
              <span className="justify-self-end">{session && <FollowButton type="profile" id={p.id} following={p.following} />}</span>
              {(p.offers.length > 0 || p.needs.length > 0) && (
                <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1 md:col-start-1">
                  {p.offers.length > 0 && <span className="text-[13px] text-muted">{t("offers")}</span>}
                  {p.offers.slice(0, 3).map((x) => <span key={`o${x}`} className={tag}>#{x}</span>)}
                  {p.needs.length > 0 && <span className={`text-[13px] text-muted ${p.offers.length ? "ml-2" : ""}`}>{t("needs")}</span>}
                  {p.needs.slice(0, 2).map((x) => <span key={`n${x}`} className={tag}>#{x}</span>)}
                </div>
              )}
            </div>
          ))}
          <span className="pt-3 text-sm text-muted">{t("followPrivate")}</span>
        </div>
      )}

    </Page>
  );
}
