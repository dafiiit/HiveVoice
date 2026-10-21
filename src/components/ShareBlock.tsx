import { getOrigin } from "@/lib/origin";
import { getTranslations } from "next-intl/server";
import type { RefType } from "@/lib/refs";
import { ShareButtons } from "./ShareButtons";
import { ShareMenu } from "./refs/ShareMenu";
import { btn } from "./ui/styles";

/**
 * One "Teilen" button: signed in, into a chat, a group or the marketplace, and for public things also out of
 * HiveVoice (link, QR code). Guests only get the link, and only for public things, because the link would show nothing.
 */
export async function ShareBlock({ path, title, isPublic, item, access, className }: {
  className?: string;
  path: string; title: string; isPublic: boolean; item?: { type: RefType; id: string } | null;
  /** The access panel, for the people who manage the thing: becomes the "Zugriff" tab. */
  access?: React.ReactNode;
}) {
  const t = await getTranslations("growth.share");
  const origin = await getOrigin();
  const external = isPublic ? { url: `${origin}${path}`, text: t("contentText") } : undefined;
  if (item) return <ShareMenu type={item.type} id={item.id} title={title} external={external} access={access} className={className} />;
  if (!external) return null;
  return (
    <details className="max-w-[720px]">
      <summary className={`${btn.secondary} list-none [&::-webkit-details-marker]:hidden`}>{t("content")}</summary>
      <div className="pt-3"><ShareButtons url={external.url} title={title} text={external.text} /></div>
    </details>
  );
}
