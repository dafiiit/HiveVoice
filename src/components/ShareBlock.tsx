import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { RefType } from "@/lib/refs";
import { ShareButtons } from "./ShareButtons";
import { ShareMenu } from "./refs/ShareMenu";

/**
 * One "Weitergeben" button: signed in, into a chat, a group or the marketplace, and for public things also out of
 * HiveVoice (link, QR code). Guests only get the link, and only for public things, because the link would show nothing.
 */
export async function ShareBlock({ path, title, isPublic, item }: { path: string; title: string; isPublic: boolean; item?: { type: RefType; id: string } | null }) {
  const t = await getTranslations("growth.share");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const external = isPublic ? { url: `${origin}${path}`, text: t("contentText") } : undefined;
  if (item) return <ShareMenu type={item.type} id={item.id} title={title} external={external} />;
  if (!external) return null;
  return (
    <details className="max-w-[720px]">
      <summary className="cursor-pointer text-sm font-bold">{t("content")}</summary>
      <div className="pt-3"><ShareButtons url={external.url} title={title} text={external.text} /></div>
    </details>
  );
}
