import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { btn, chip, field } from "../ui/styles";
import { Popover } from "../ui/Popover";

export type Radius = { key: string; name: string };

/**
 * Compact filter for the marketplace: one button that opens a small panel
 * (area and search/hashtag). Works without JavaScript, it is a plain GET form.
 */
export async function MarketFilter({ radii, radius, q, tags, keep }: { radii: Radius[]; radius: string; q: string; tags: string[]; keep: Record<string, string> }) {
  const t = await getTranslations("connect.mf");
  const active = (radius !== radii[0]?.key ? 1 : 0) + (q ? 1 : 0);
  const reset = `/connect?${new URLSearchParams({ c: "market", ...keep })}`;
  const tagHref = (tag: string) => `/connect?${new URLSearchParams({ c: "market", ...keep, ...(radius !== radii[0]?.key ? { r: radius } : {}), q: `#${tag}` })}`;
  return (
    <Popover label={t("label")} badge={active} align="right">
      <form method="get" action="/connect" className="flex flex-col gap-3">
        <input type="hidden" name="c" value="market" />
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {radii.length > 1 && (
          <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-bold">{t("radius")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {radii.map((r, i) => (
                <label key={r.key} className="cursor-pointer">
                  <input type="radio" name="r" value={i === 0 ? "" : r.key} defaultChecked={radius === r.key} className="peer sr-only" />
                  <span className={`${chip(false)} peer-checked:bg-ink peer-checked:font-bold peer-checked:text-on-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-red`}>{r.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">{t("search")}
          <input type="search" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className={field.search} />
        </label>
        {tags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold">{t("tags")}</span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((x) => <Link key={x} href={tagHref(x)} className={chip(q === `#${x}`)}>#{x}</Link>)}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className={btn.primarySm}>{t("apply")}</button>
          {active > 0 && <Link href={reset} className={`${btn.linkMuted} text-sm`}>{t("reset")}</Link>}
        </div>
      </form>
    </Popover>
  );
}
