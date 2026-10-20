import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { chip } from "../ui/styles";

/** For server admins: switch between the normal app and the admin view. */
export async function ViewSwitch({ admin }: { admin: boolean }) {
  const t = await getTranslations("admin");
  return (
    <nav aria-label={t("view")} className="flex gap-px">
      <Link href="/" aria-current={!admin ? "page" : undefined} className={chip(!admin)}>{t("viewUser")}</Link>
      <Link href="/admin" aria-current={admin ? "page" : undefined} className={chip(admin)}>{t("viewAdmin")}</Link>
    </nav>
  );
}
