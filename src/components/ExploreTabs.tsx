import { getTranslations } from "next-intl/server";
import { Tabs } from "./ui/Page";

export const EXPLORE_KINDS = ["initiatives", "groups", "people", "responsible", "links"] as const;
export type ExploreKind = (typeof EXPLORE_KINDS)[number];

/** The tabs of Entdecken. Zuständige have their own page (/responsible) with search and requests, but belong here. */
export async function ExploreTabs({ active, href }: { active: ExploreKind; href?: (k: ExploreKind) => string }) {
  const t = await getTranslations("explore");
  const to = (k: ExploreKind) => (k === "responsible" ? "/responsible" : href ? href(k) : k === "initiatives" ? "/explore" : `/explore?kind=${k}`);
  return <Tabs label={t("what")} items={EXPLORE_KINDS.map((k) => ({ href: to(k), label: t(`kinds.${k}`), on: active === k }))} />;
}
