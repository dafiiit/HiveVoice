import { getTranslations } from "next-intl/server";
import { Pinboard } from "@/components/community/Pinboard";
import { PostThread } from "@/components/community/PostThread";
import { BackLink } from "@/components/ui/Page";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("board") };
}

/**
 * Gemeinschaft → Pinnwand: one stream across the whole width (no list and detail side by side),
 * a post opens with its replies in the same place, with a way back to the feed.
 */
export default async function Board({ searchParams }: PageProps<"/community">) {
  const sp = await searchParams;
  const t = await getTranslations("community");
  const post = typeof sp.post === "string" ? sp.post : null;
  const back = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "post") as [string, string][]);
  return (
    <div className="md:h-[calc(100dvh-4rem)] md:overflow-y-auto">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <h1 className="m-0 text-[22px] font-bold leading-tight">{t("nav.board")}</h1>
        {post
          ? <><BackLink href={`/community${back.size ? `?${back}` : ""}`} label={t("nav.board")} /><PostThread id={post} /></>
          : <Pinboard sp={sp} />}
      </div>
    </div>
  );
}
