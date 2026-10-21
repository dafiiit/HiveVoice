import { getTranslations } from "next-intl/server";
import { Pinboard } from "@/components/community/Pinboard";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("board") };
}

/**
 * Gemeinschaft → Pinnwand: one stream across the whole width. Replies fold open under each post, like a thread;
 * `?post=` (from a notification) opens that post in the feed.
 */
export default async function Board({ searchParams }: PageProps<"/community">) {
  const sp = await searchParams;
  const t = await getTranslations("community");
  const post = typeof sp.post === "string" ? sp.post : null;
  return (
    <div className="md:h-[calc(100dvh-4rem)] md:overflow-y-auto">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <h1 className="m-0 text-[22px] font-bold leading-tight max-md:sr-only">{t("nav.board")}</h1>
        <Pinboard sp={sp} openId={post} />
      </div>
    </div>
  );
}
