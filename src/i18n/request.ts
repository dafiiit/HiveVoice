import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { EASY_COOKIE, LANG_COOKIE, type Language } from "./config";
import { loadMessages } from "../../messages";

export default getRequestConfig(async () => {
  const store = await cookies();
  // German unless someone picked another language (cookie).
  const lang: Language = store.get(LANG_COOKIE)?.value === "en" ? "en" : "de";
  const easy = lang === "de" && store.get(EASY_COOKIE)?.value === "1";
  return { locale: lang, messages: loadMessages(lang, easy), timeZone: "Europe/Berlin" };
});
