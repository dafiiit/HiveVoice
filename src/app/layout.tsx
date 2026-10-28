import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { EASY_COOKIE, LANG_COOKIE, THEME_COOKIE } from "@/i18n/config";
import { I18nProvider } from "@/components/I18nProvider";
import { ServiceWorker } from "@/components/ServiceWorker";
import { runtimeSupabase } from "@/lib/supabase/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: "HiveVoice", template: "%s · HiveVoice" },
    description: t("description"),
    applicationName: "HiveVoice",
    appleWebApp: { capable: true, title: "HiveVoice", statusBarStyle: "default" },
  };
}

const themeOf = (value?: string) => (value === "dark" || value === "system" ? value : "light");

export async function generateViewport(): Promise<Viewport> {
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  return {
    themeColor:
      theme === "system"
        ? [{ media: "(prefers-color-scheme: light)", color: "#f4f4f4" }, { media: "(prefers-color-scheme: dark)", color: "#111111" }]
        : theme === "dark" ? "#111111" : "#f4f4f4",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const locale = await getLocale();
  const theme = themeOf(jar.get(THEME_COOKIE)?.value);
  const lang = jar.get(LANG_COOKIE)?.value === "en" ? "en" : "de";
  // A self-hosted instance tells the browser where its login and file services are (src/lib/supabase/config.ts).
  const supabase = runtimeSupabase();
  return (
    <html lang={locale} data-theme={theme}>
      <body className="min-h-dvh">
        {supabase && <script dangerouslySetInnerHTML={{ __html: `window.__hvSupabase=${JSON.stringify(supabase).replace(/</g, "\\u003c")}` }} />}
        <I18nProvider lang={lang} easy={lang === "de" && jar.get(EASY_COOKIE)?.value === "1"}>
          {children}
          <ServiceWorker />
        </I18nProvider>
      </body>
    </html>
  );
}
