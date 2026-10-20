import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { THEME_COOKIE } from "@/i18n/config";
import { ServiceWorker } from "@/components/ServiceWorker";
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
  const locale = await getLocale();
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} data-theme={theme}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {children}
          <ServiceWorker />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
