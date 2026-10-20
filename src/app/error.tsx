"use client";
import { useTranslations } from "next-intl";
import { Glyph } from "@/components/ui/Glyph";
import { btn } from "@/components/ui/styles";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <main className="flex min-h-[60dvh] flex-col justify-center gap-6 px-6 md:px-10">
      <Glyph shape="hourglass" size={80} />
      <h1 className="display m-0">{t("error")}</h1>
      <p className="m-0 max-w-[520px] text-lg">{t("errorText")}</p>
      <button type="button" onClick={reset} className={`${btn.primary} self-start`}>{t("retry")}</button>
    </main>
  );
}
