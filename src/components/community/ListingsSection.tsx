import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { getPlace } from "@/lib/place";
import { MarketExplore } from "@/components/listings/MarketExplore";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { BackToList, Split } from "@/components/shell/Split";
import { IconPlus } from "@/components/ui/Icons";
import { btn, tab } from "@/components/ui/styles";

type SP = Record<string, string | string[] | undefined>;

/** Gemeinschaft → Anliegen: everyone's offers and wanted posts with their filters on the left, the map or one listing on the right. */
export async function ListingsSection({ sp, id }: { sp: SP; id?: string }) {
  const session = await getSession();
  const t = await getTranslations("market");
  const place = await getPlace();
  const side = sp.tab === "needs" ? "need" : "offer";
  const keep = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
  const tabHref = (k: "offers" | "needs") => { const p = new URLSearchParams(keep); p.set("tab", k); p.delete("cat"); return `/community/listings?${p}`; };
  const homeRegions = place?.chain.map((r) => r.id) ?? [];
  // Phones see the map only when asked for it (on wide screens it fills the right side anyway).
  const mapOpen = !id && sp.view === "map";
  const listHref = (() => { const p = new URLSearchParams(keep); p.delete("view"); return `/community/listings${p.size ? `?${p}` : ""}`; })();
  const mapHref = (() => { const p = new URLSearchParams(keep); p.set("view", "map"); return `/community/listings?${p}`; })();
  let detail: ReactNode;
  if (id) detail = <><BackToList href={`/community/listings${keep.size ? `?${keep}` : ""}`} label={t("communityTitle")} /><ListingDetail id={id} embedded /></>;
  else detail = <>{mapOpen && <BackToList href={listHref} label={t("communityTitle")} />}<MarketExplore sp={sp} session={session} side={side} homeRegions={homeRegions} base="/community/listings" layout="map" /></>;
  return (
    <Split open={!!id || mapOpen}
      list={
        <div className="flex flex-col gap-3 px-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold leading-tight">{t("communityTitle")}</h1>
            <span className="flex items-center gap-2">
            <Link href={mapHref} className={`${btn.secondarySm} md:hidden`}>{t("map")}</Link>
            <Link href={session ? "/me/listings/new" : "/login?next=/me/listings/new"} className={btn.primarySm} title={t("create")}><IconPlus size={14} /> <span className="max-lg:sr-only">{t("create")}</span></Link>
            </span>
          </div>
          <div role="tablist" aria-label={t("view")} className="flex border-b border-line">
            {(["offers", "needs"] as const).map((k) => (
              <Link key={k} role="tab" aria-selected={(side === "need") === (k === "needs")} href={tabHref(k)} className={tab((side === "need") === (k === "needs"))}>{t(`tabs.${k}`)}</Link>
            ))}
          </div>
          <MarketExplore sp={sp} session={session} side={side} homeRegions={homeRegions} base="/community/listings" layout="rows" selected={id} />
        </div>
      }
      detail={detail} />
  );
}
