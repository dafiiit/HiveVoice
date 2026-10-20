import { getTranslations } from "next-intl/server";
import { Tabs } from "./ui/Page";

const PAGES = [
  { key: "principles", href: "/principles" },
  { key: "rights", href: "/rights" },
  { key: "transparency", href: "/transparency" },
  { key: "privacy", href: "/legal/privacy" },
  { key: "imprint", href: "/legal/imprint" },
] as const;

/** "So funktioniert HiveVoice": the pages that explain the principles, rights and rules, under one navigation. */
export async function InfoTabs({ active }: { active: (typeof PAGES)[number]["key"] }) {
  const t = await getTranslations("info");
  return <Tabs label={t("nav")} items={PAGES.map((p) => ({ href: p.href, label: t(`tabs.${p.key}`), on: p.key === active }))} />;
}
