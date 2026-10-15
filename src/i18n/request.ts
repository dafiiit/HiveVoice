import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { EASY_COOKIE, LANG_COOKIE, type Language } from "./config";
import { loadMessages } from "../../messages";

export default getRequestConfig(async () => {
  const store = await cookies();
  let lang = store.get(LANG_COOKIE)?.value as Language | undefined;
  if (lang !== "de" && lang !== "en") {
    const accept = (await headers()).get("accept-language") ?? "";
    lang = /^en\b/i.test(accept) ? "en" : "de";
  }
  const easy = lang === "de" && store.get(EASY_COOKIE)?.value === "1";
  return { locale: lang, messages: loadMessages(lang, easy), timeZone: "Europe/Berlin" };
});
