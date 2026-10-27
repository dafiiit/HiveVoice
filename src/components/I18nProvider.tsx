"use client";
import { useMemo, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { loadMessages } from "../../messages";

/**
 * The texts for the components that run in the browser. They used to travel inside every page (three quarters of each page
 * was the whole text catalog, again and again, also on every refresh). Now the catalog is part of the program files,
 * which the browser keeps and the service worker holds for offline use: a page only says which language and which
 * mode (Leichte Sprache) it is in.
 */
export function I18nProvider({ lang, easy, children }: { lang: "de" | "en"; easy: boolean; children: ReactNode }) {
  const messages = useMemo(() => loadMessages(lang, easy), [lang, easy]);
  return <NextIntlClientProvider locale={lang} messages={messages} timeZone="Europe/Berlin">{children}</NextIntlClientProvider>;
}
