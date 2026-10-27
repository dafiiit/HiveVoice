import { getTranslations } from "next-intl/server";
import { AreaFrame } from "@/components/shell/AreaNav";

/** Ich: what I made for myself (the toolbox) and my own listings. The account settings sit in the avatar menu. */
export default async function MeLayout({ children }: LayoutProps<"/me">) {
  const t = await getTranslations("mine");
  return (
    <AreaFrame title={t("area")} label={t("sections")} items={[
      { href: "/me", label: t("filters.all") },
      { href: "/me/listings", label: t("filters.listings"), match: ["/me/listings*"] },
      { href: "/me/notes", label: t("filters.notes"), match: ["/me/notes*"] },
      { href: "/me/diagrams", label: t("filters.diagrams"), match: ["/me/diagrams*"] },
      { href: "/me/uploads", label: t("filters.uploads"), match: ["/me/uploads*"] },
      { href: "/me/initiatives", label: t("filters.projects"), match: ["/me/initiatives*"] },
    ]}>{children}</AreaFrame>
  );
}
