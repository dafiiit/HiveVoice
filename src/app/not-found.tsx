import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Glyph } from "@/components/ui/Glyph";
import { btn } from "@/components/ui/styles";

export default async function NotFound() {
  const t = await getTranslations("errorPage");
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 px-6 md:px-10 md:pl-[25%]">
      <Glyph shape="keyhole" size={96} />
      <h1 className="display m-0">{t("notFound")}</h1>
      <p className="m-0 max-w-[520px] text-lg">{t("notFoundText")}</p>
      <Link href="/" className={`${btn.primary} self-start`}>{t("home")}</Link>
    </main>
  );
}
