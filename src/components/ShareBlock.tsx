import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ShareButtons } from "./ShareButtons";

/** "Pass this on": a link to exactly this page. Not offered for things that are not public, because the link would show nothing. */
export async function ShareBlock({ path, title, isPublic }: { path: string; title: string; isPublic: boolean }) {
  const t = await getTranslations("growth.share");
  if (!isPublic) return <p className="m-0 text-sm text-muted">{t("contentPrivate")}</p>;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return (
    <details className="max-w-[720px]">
      <summary className="cursor-pointer text-sm font-bold">{t("content")}</summary>
      <div className="pt-3"><ShareButtons url={`${origin}${path}`} title={title} text={t("contentText")} /></div>
    </details>
  );
}
