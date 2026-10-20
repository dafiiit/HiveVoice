import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts, marketTags } from "@/lib/posts";
import { getPlace } from "@/lib/place";
import { Composer, PostList } from "@/components/PostList";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PlaceMenu } from "@/components/shell/PlaceMenu";
import { SearchField } from "@/components/ui/SearchField";
import { chip } from "@/components/ui/styles";

// From near to far. "Nachbarschaft" is the borough, where a town has them.
const LEVELS = ["borough", "municipality", "state", "country"] as const;
type Level = (typeof LEVELS)[number];

/**
 * Gemeinschaft → Pinnwand: one stream for everyone on the platform, filtered by hand to a place
 * (neighbourhood, town, state, country) and a tag. The automatic filter "passt zu mir" comes later (TASKS.md).
 */
export async function Pinboard({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("community.board");
  const place = await getPlace();
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim().slice(0, 80) : "");
  const tagParam = str("tag").replace(/^#/, "").toLowerCase();
  const q = str("q");

  // The steps of the own place that exist (a village has no borough, a guest maybe no place at all).
  const steps = LEVELS.map((l) => ({ level: l, region: place?.chain.find((r) => r.level === l) ?? null })).filter((s) => s.region);
  const wanted = (LEVELS as readonly string[]).includes(str("r")) ? (str("r") as Level) : "municipality";
  const area = steps.find((s) => s.level === wanted) ?? steps.find((s) => s.level === "municipality") ?? steps[0] ?? null;
  // New posts go to the finest place, so they show in the neighbourhood and in everything above it.
  const home = steps[0]?.region ?? null;

  const data = await asViewer(viewer, async (tx) => {
    const search = [tagParam ? `#${tagParam}` : "", q].filter(Boolean).join(" ");
    const posts = area?.region ? await loadPosts(tx, { underRegionId: area.region.id, search }, me, { sort: "new" }) : [];
    const tags = area?.region ? await marketTags(tx, area.region.id, 10) : [];
    return { posts, tags };
  });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ r: area?.level ?? "", tag: tagParam, q, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "r" && v === "municipality")) p.delete(k);
    return `/community${p.size ? `?${p}` : ""}`;
  };
  const filtered = !!(tagParam || q || (area && area.level !== "municipality"));

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      {!area ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-muted">{t("noPlace")}</p>
          <PlaceMenu signedIn={!!session} place={null} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[13px] font-bold">{t("where")}</span>
            <div role="group" aria-label={t("where")} className="flex gap-1.5 max-md:-mx-4 max-md:w-[calc(100%+2rem)] max-md:overflow-x-auto max-md:px-4 md:flex-wrap">
              {steps.map((s) => (
                <Link key={s.level} href={href({ r: s.level })} aria-pressed={area.level === s.level} className={`${chip(area.level === s.level)} flex-none`}>
                  {t(`levels.${s.level}`)}<span className="font-normal">&nbsp;· {s.region!.name}</span>
                </Link>
              ))}
            </div>
            <PlaceMenu signedIn={!!session} place={place ? { id: place.id, name: place.name, level: place.level, chain: place.chain } : null} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[13px] font-bold">{t("tag")}</span>
            <div role="group" aria-label={t("tag")} className="flex min-w-0 flex-wrap gap-1.5">
              <Link href={href({ tag: "" })} aria-pressed={!tagParam} className={chip(!tagParam)}>{t("allTags")}</Link>
              {Array.from(new Set([...(tagParam ? [tagParam] : []), ...data.tags])).map((x) => (
                <Link key={x} href={href({ tag: tagParam === x ? "" : x })} aria-pressed={tagParam === x} className={chip(tagParam === x)}>#{x}</Link>
              ))}
            </div>
            <form action="/community" role="search" className="flex min-w-[200px] flex-1 gap-2">
              {area.level !== "municipality" && <input type="hidden" name="r" value={area.level} />}
              {tagParam && <input type="hidden" name="tag" value={tagParam} />}
              <SearchField className="flex-1" name="q" defaultValue={q} label={t("search")} placeholder={t("search")} />
            </form>
          </div>
        </div>
      )}
      {session && home ? (
        <Composer ctx={{ regionId: home.id }} path="/community" placeholder={t("placeholder", { place: home.name })}
          viewerName={session.profile.display_name} viewerSeed={session.profile.avatar_seed} viewerPath={session.profile.avatar_path} />
      ) : !session && <p className="m-0 text-sm text-muted">{t("readOnly")} <Link href="/login?next=/community" className="font-bold text-ink underline">{t("signIn")}</Link></p>}
      <PostList posts={data.posts} path="/community" canWrite={!!session?.profile.verified} viewerId={me ?? undefined}
        empty={filtered ? t("none") : t("empty")} />
    </div>
  );
}
