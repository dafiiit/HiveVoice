import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { EASY_COOKIE } from "@/i18n/config";
import { LanguageSwitch } from "./LanguageSwitch";

export async function LanguageMenu() {
  const locale = await getLocale();
  const easy = locale === "de" && (await cookies()).get(EASY_COOKIE)?.value === "1";
  return <LanguageSwitch current={locale === "en" ? "en" : easy ? "easy" : "de"} />;
}
