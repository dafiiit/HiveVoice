import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer, type Tx } from "@/lib/db";
import type { Session } from "@/lib/session";
import { listingCardColumns, listingCardFrom, myRegionIds, regionTree, type ListingCard } from "@/lib/queries";
import { CATEGORIES, CATEGORY_DEFS, isCategory, type FieldDef } from "@/lib/market";
import { IconCheck } from "../ui/Icons";
import { Popover } from "../ui/Popover";
import { btn, chip, field, segment, segments } from "../ui/styles";
import { Toolbar } from "../ui/Page";
import { SearchField } from "../ui/SearchField";
import { ListingCardView } from "./ListingCardView";
import { MarketMap, type MapPoint } from "./MarketMap";

type SP = Record<string, string | string[] | undefined>;
const SORTS = ["relevant", "new", "price", "date"] as const;

/** URL parameter of a category field in the filters: a_<key>, min_<key> for numbers, from_<key> for dates. */
const param = (f: FieldDef) => (f.type === "number" ? `min_${f.key}` : f.type === "date" ? `from_${f.key}` : `a_${f.key}`);

/**
 * The marketplace in "Anliegen" (tabs Angebote and Gesuche): by category, with the category's own filters
 * (jobs by employment and workplace, flats by rooms and rent, things by condition ...), as a list or a map.
 */
export async function MarketExplore({ sp, session, homeRegions, side }: { sp: SP; session: Session | null; homeRegions: string[]; side: "offer" | "need" }) {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const t = await getTranslations("explore");
  const tm = await getTranslations("explore.market");
  const tcat = await getTranslations("categories");
  const cat = isCategory(str("cat")) ? str("cat") as (typeof CATEGORIES)[number] : null;
  const q = str("q").trim();
  const free = str("free") === "1";
  const max = Number(str("max")) > 0 ? Math.round(Number(str("max"))) : null;
  const sort = (SORTS as readonly string[]).includes(str("sort")) ? str("sort") : "relevant";
  const view = str("view") === "map" ? "map" : "list";
  const mine = str("mine") === "1";
  const placeId = /^[0-9a-f-]{36}$/.test(str("place")) ? str("place") : "";
  const defs = cat ? CATEGORY_DEFS[cat].fields.filter((f) => f.filter) : [];
  const attr: Record<string, string> = Object.fromEntries(defs.map((f) => [param(f), str(param(f))]).filter(([, v]) => v));
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;

  const [place] = placeId ? await asViewer(null, (tx) => tx<{ id: string; name: string }[]>`select id, name from public.regions where id = ${placeId}`) : [];

  const data = await asViewer(viewer, async (tx) => {
    const regions = me ? await myRegionIds(tx, me) : homeRegions;
    const like = `%${q.toLowerCase()}%`;
    const where = (x: Tx) => x`
      l.kind = ${side} and l.status = 'active'
      ${cat ? x`and l.category = ${cat}` : x``}
      ${q ? x`and (l.search @@ websearch_to_tsquery('german', ${q}) or lower(l.title) like ${like}
                or exists (select 1 from public.listing_tags lt join public.tags tg on tg.id = lt.tag_id where lt.listing_id = l.id and tg.slug like ${q.toLowerCase().replace(/^#/, "") + "%"}))` : x``}
      ${free ? x`and l.pay_mode = 'free'` : x``}
      ${max ? x`and (l.pay_mode in ('free', 'swap') or (l.pay_mode = 'fixed' and l.fixed_price_cents <= ${max * 100}) or (l.pay_mode = 'hourly' and l.hourly_rate_cents <= ${max * 100}))` : x``}
      ${mine ? x`and l.region_id = any(${regions}::uuid[])` : x``}
      ${place ? x`and l.region_id in ${regionTree(x, place.id)}` : x``}
      ${defs.reduce((acc, f) => x`${acc} ${attrFilter(x, f)}`, x``)}`;
    const attrFilter = (x: Tx, f: FieldDef) => {
        const v = attr[param(f)];
        if (!v) return x``;
        if (f.type === "number") return Number(v) > 0 ? x`and (case when jsonb_typeof(l.attrs -> ${f.key}) = 'number' then (l.attrs ->> ${f.key})::numeric end) >= ${Number(v)}` : x``;
        if (f.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? x`and l.attrs ->> ${f.key} >= ${v}` : x``;
        if (f.type === "bool") return x`and l.attrs ->> ${f.key} = 'true'`;
        if (f.type === "text") return x`and lower(l.attrs ->> ${f.key}) like ${`%${v.toLowerCase()}%`}`;
        return x`and l.attrs ->> ${f.key} = ${v}`;
    };
    const order = sort === "new" ? tx`l.created_at desc`
      : sort === "price" ? tx`case l.pay_mode when 'free' then 0 when 'swap' then 0 else coalesce(l.fixed_price_cents, l.hourly_rate_cents, 0) end asc, l.created_at desc`
      : sort === "date" ? tx`coalesce(l.attrs ->> 'date', l.attrs ->> 'from', l.attrs ->> 'start') asc nulls last, l.created_at desc`
      : tx`(l.region_id = any(${regions}::uuid[])) desc, l.created_at desc`;
    const cards = view === "list" ? await tx<ListingCard[]>`
      select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where ${where(tx)} ${me ? tx`and l.owner_id <> ${me}` : tx``} order by ${order} limit 60` : [];
    const points = view === "map" ? await tx<MapPoint[]>`
      select r.id, r.name, r.lat, r.lon, count(*)::int as n,
             (array_agg(json_build_object('id', l.id, 'title', l.title, 'kind', l.kind) order by l.created_at desc))[1:6] as items
      from ${listingCardFrom(tx)} where ${where(tx)} and r.lat is not null group by r.id, r.name, r.lat, r.lon` : [];
    const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from ${listingCardFrom(tx)} where ${where(tx)}`;
    const counts = await tx<{ category: string; n: number }[]>`
      select l.category, count(*)::int as n from public.listings l where l.kind = ${side} and l.status = 'active' group by l.category`;
    const sentTo = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.contact_requests where from_profile_id = ${me} and status in ('pending', 'accepted')`).map((r) => r.listing_id) : [];
    const own = me ? await tx<{ id: string; title: string }[]>`
      select id, title from public.listings where owner_id = ${me} and kind <> ${side} and status = 'active' order by created_at desc limit 20` : [];
    return { cards, points, total, counts: Object.fromEntries(counts.map((c) => [c.category, c.n])) as Record<string, number>, sentTo, own };
  });

  const base = { tab: side === "offer" ? "offers" : "needs", cat: cat ?? "", q, free: free ? "1" : "", max: max ? String(max) : "", sort, view, mine: mine ? "1" : "", place: place?.id ?? "", ...attr };
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...base, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "sort" && v === "relevant") || (k === "view" && v === "list")) p.delete(k);
    return `/anliegen?${p}`;
  };
  // Switching the category drops the fields of the old one.
  const catHref = (c: string) => href({ ...Object.fromEntries(Object.keys(attr).map((k) => [k, ""])), cat: c });
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const active = defs.filter((f) => attr[param(f)]).length + (free ? 1 : 0) + (max ? 1 : 0) + (mine ? 1 : 0);
  const mapped = data.points.reduce((a, p) => a + p.n, 0);
  const hidden = Object.entries(base).filter(([k]) => k !== "q");

  return (
    <div className="flex flex-col gap-4">
      <form action="/anliegen" className="flex gap-2">
        {hidden.map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <SearchField name="q" defaultValue={q} label={tm("search")} placeholder={tm("searchPlaceholder")} className="flex-1" />
        <button type="submit" className={btn.primarySm}>{t("search")}</button>
      </form>

      <nav aria-label={tcat("label")} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Link href={catHref("")} aria-current={!cat ? "true" : undefined} className={`${chip(!cat)} flex-none`}>{tcat("all")} · {all}</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={catHref(c)} aria-current={cat === c ? "true" : undefined} className={`${chip(cat === c)} flex-none`}>
            {tcat(`names.${c}`)}{data.counts[c] ? ` · ${data.counts[c]}` : ""}
          </Link>
        ))}
      </nav>

      <Toolbar count={t("count.market", { n: data.total })}>
        <Popover label={t("filter")} badge={active}>
          <form action="/anliegen" className="flex flex-col gap-3">
            {Object.entries(base).filter(([k]) => ["tab", "cat", "q", "sort", "view", "place"].includes(k)).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
            {defs.map((f) => {
              const label = tcat(`${cat}.${f.key}` as "label");
              const name = param(f);
              const v = attr[name] ?? "";
              if (f.type === "select") return (
                <label key={f.key} className={field.label}>{label}
                  <select name={name} defaultValue={v} className={field.select}>
                    <option value="">{tcat("any")}</option>
                    {f.options.map((o) => <option key={o} value={o}>{tcat(`${cat}.${f.key}Options.${o}` as "label")}</option>)}
                  </select>
                </label>
              );
              if (f.type === "bool") return (
                <label key={f.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} value="1" defaultChecked={!!v} className="h-5 w-5 accent-[var(--ink)]" />{label}</label>
              );
              if (f.type === "number") return (
                <label key={f.key} className={field.label}>{tm("minLabel", { label })}<input type="number" name={name} min={0} defaultValue={v} className={`${field.input} w-32`} /></label>
              );
              if (f.type === "date") return (
                <label key={f.key} className={field.label}>{tm("dateFrom", { label })}<input type="date" name={name} defaultValue={v} className={field.input} /></label>
              );
              return <label key={f.key} className={field.label}>{label}<input name={name} defaultValue={v} className={field.input} /></label>;
            })}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="free" value="1" defaultChecked={free} className="h-5 w-5 accent-[var(--ink)]" />{tm("freeOnly")}</label>
            <label className={field.label}>{tm("maxPrice")}<input type="number" name="max" min={0} defaultValue={max ?? ""} className={`${field.input} w-32`} /></label>
            {session && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-5 w-5 accent-[var(--ink)]" />{t("nearMe")}</label>}
            <div className="flex items-center gap-3">
              <button type="submit" className={`${btn.primarySm}`}>{tm("apply")}</button>
              {active > 0 && <Link href={href({ ...Object.fromEntries(Object.keys(attr).map((k) => [k, ""])), free: "", max: "", mine: "" })} className={`${btn.linkMuted} text-sm`}>{tm("reset")}</Link>}
            </div>
          </form>
        </Popover>
        {view === "list" && (
          <Popover label={<>{t("sort")} <span className="font-normal">{tm(`sorts.${sort as "relevant"}`)}</span></>}>
            <div className="flex flex-col" role="group" aria-label={t("sort")}>
              {SORTS.map((s) => (
                <Link key={s} href={href({ sort: s })} aria-current={sort === s ? "true" : undefined}
                  className={`flex h-10 items-center justify-between border-b border-line text-ink no-underline last:border-b-0 ${sort === s ? "font-bold" : ""}`}>
                  {tm(`sorts.${s}`)}{sort === s && <IconCheck size={12} />}
                </Link>
              ))}
            </div>
          </Popover>
        )}
        <div role="radiogroup" aria-label={tm("view")} className={segments}>
          {(["list", "map"] as const).map((v) => (
            <Link key={v} role="radio" aria-checked={view === v} href={href({ view: v })} className={segment(view === v)}>{tm(`views.${v}`)}</Link>
          ))}
        </div>
        {place && <Link href={href({ place: "" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: place.name })}>{t("inPlace", { name: place.name })} <span aria-hidden="true">✕</span></Link>}
        {q && <Link href={href({ q: "" })} className={`${chip(true)} gap-1.5`} aria-label={t("removeFilter", { what: q })}>{t("searchChip", { q })} <span aria-hidden="true">✕</span></Link>}
      </Toolbar>

      {view === "list" && (data.cards.length === 0
        ? <p className="m-0 border-t border-line pt-6 text-muted">{t("nothing")}</p>
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.cards.map((c) => <ListingCardView key={c.id} c={c} signedIn={!!session} sent={data.sentTo.includes(c.id)} mine={data.own} />)}
          </div>)}

      {view === "map" && (
        <div className="flex flex-col gap-2">
          <MarketMap points={data.points} placeHref={href({ view: "", place: "__PLACE__" })} />
          <span className="text-sm text-muted">{tm("mapPrivacy")}{data.total > mapped ? ` ${tm("mapMissing", { n: data.total - mapped })}` : ""}</span>
        </div>
      )}
    </div>
  );
}
