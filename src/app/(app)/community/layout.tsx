import { getTranslations } from "next-intl/server";
import { AreaFrame } from "@/components/shell/AreaNav";

/** Gemeinschaft: everyone on the platform. Pinnwand, the listings of others, groups and people. */
export default async function CommunityLayout({ children }: LayoutProps<"/community">) {
  const t = await getTranslations("community");
  return (
    <AreaFrame title={t("title")} label={t("sections")} items={[
      { href: "/community", label: t("nav.board") },
      { href: "/community/listings", label: t("nav.listings"), match: ["/community/listings*"] },
      { href: "/community/groups", label: t("nav.groups"), match: ["/community/groups*"] },
      { href: "/community/people", label: t("nav.people"), match: ["/community/people*"] },
    ]}>{children}</AreaFrame>
  );
}
