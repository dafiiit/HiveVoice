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
import { chip, segment, segments } from "@/components/ui/styles";

// From near to far. "Nachbarschaft" is the borough, where a town has them.
const LEVELS = ["borough", "municipality", "state", "country"] as const;
type Level = (typeof LEVELS)[number];

/**
 * Gemeinschaft → Pinnwand: one stream for everyone on the platform, filtered by hand to a place
 * (neighbourhood, town, state, country) and a tag. The automatic filter "passt zu mir" comes later (TASKS.md).
 */
export async function Pinboard({ sp, openId }: { sp: Record<string, string | string[] | undefined>; openId?: string | null }) {
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
    const feed = area?.region ? await loadPosts(tx, { underRegionId: area.region.id, search }, me, { sort: "new" }) : [];
    // A post opened from a notification or a link: open in the feed; if it is not in this view, on top of it.
    const extra = openId && /^[0-9a-f-]{36}$/.test(openId) && !feed.some((p) => p.id === openId) ? await loadPosts(tx, { postId: openId }, me) : [];
    const posts = [...extra, ...feed];
    const tags = area?.region ? await marketTags(tx, area.region.id, 10) : [];
    return { posts, tags };
  });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ r: area?.level ?? "", tag: tagParam, q, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "r" && v === "municipality")) p.delete(k);
    return `/community${p.size ? `?${p}` : ""}`;
  };
  const filtered = !!(tagParam || q || (area && area.level !== "municipality"));

  const topics = Array.from(new Set([...(tagParam ? [tagParam] : []), ...data.tags]));
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} scope="board" />
      {!area ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-muted">{t("noPlace")}</p>
          <PlaceMenu signedIn={!!session} place={null} size="sm" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* The reach as one switch (near to far), the own place at the far end of the same line. The names of the places are in the tooltips and in the writing field below. */}
          <div role="group" aria-label={t("where")} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <nav aria-label={t("reach")} className={`${segments} scroll-hint max-w-full overflow-x-auto max-md:[&>*]:px-2`}>
              {steps.map((s) => (
                <Link key={s.level} href={href({ r: s.level })} title={s.region!.name} aria-current={area.level === s.level ? "true" : undefined} className={`${segment(area.level === s.level)} flex-none`}>
                  {t(`levels.${s.level}`)}
                </Link>
              ))}
            </nav>
            <PlaceMenu size="sm" className="flex-none" signedIn={!!session} place={place ? { id: place.id, name: place.name, level: place.level, chain: place.chain } : null} />
          </div>
          {/* Topics only when there are some: a lone "Alle" would filter nothing. */}
          {topics.length > 0 && (
            <div role="group" aria-label={t("tag")} className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] font-bold">{t("tag")}</span>
              <Link href={href({ tag: "" })} aria-pressed={!tagParam} className={`${chip(!tagParam)} flex-none`}>{t("allTags")}</Link>
              {topics.map((x) => (
                <Link key={x} href={href({ tag: tagParam === x ? "" : x })} aria-pressed={tagParam === x} className={`${chip(tagParam === x)} flex-none`}>#{x}</Link>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Search and writing are the two fields of the board: same height (44 px), same width. */}
      {area && (
        <form action="/community" role="search" className="flex">
          {area.level !== "municipality" && <input type="hidden" name="r" value={area.level} />}
          {tagParam && <input type="hidden" name="tag" value={tagParam} />}
          <SearchField box="md" className="flex-1" name="q" defaultValue={q} label={t("search")} placeholder={t("search")} />
        </form>
      )}
      {session && home ? (
        <Composer ctx={{ regionId: home.id }} path="/community" placeholder={t("placeholder", { place: area?.region?.name ?? home.name })} />
      ) : !session && <p className="m-0 text-sm text-muted">{t("readOnly")} <Link href="/login?next=/community" className="font-bold text-ink underline">{t("signIn")}</Link></p>}
      <PostList posts={data.posts} path="/community" canWrite={!!session?.profile.verified} viewerId={me ?? undefined}
        empty={filtered ? t("none") : session ? t("empty") : t("emptyGuest")} openId={openId} />
    </div>
  );
}
