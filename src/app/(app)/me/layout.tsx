import { getTranslations } from "next-intl/server";
import { AreaFrame } from "@/components/shell/AreaNav";

/** Ich: what I made for myself (the toolbox) and my own listings. The account settings sit in the avatar menu. */
export default async function MeLayout({ children }: LayoutProps<"/me">) {
  const t = await getTranslations("mine");
  return (
    <AreaFrame title={t("area")} label={t("sections")} items={[
      { href: "/me", label: t("filters.all") },
      { href: "/me/listings", label: t("filters.listings"), match: ["/me/listings*"] },
      { href: "/me?f=lists", label: t("filters.lists"), match: ["/me?f=lists", "/me/lists/*"] },
      { href: "/me?f=notes", label: t("filters.notes"), match: ["/me?f=notes", "/me?f=docs"] },
      { href: "/me?f=uploads", label: t("filters.uploads"), match: ["/me?f=uploads"] },
      { href: "/me?f=projects", label: t("filters.projects"), match: ["/me?f=projects"] },
    ]}>{children}</AreaFrame>
  );
}
