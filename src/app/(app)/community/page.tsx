import { getTranslations } from "next-intl/server";
import { Pinboard } from "@/components/community/Pinboard";
import { PostThread } from "@/components/community/PostThread";
import { BackToList, Pick, Split } from "@/components/shell/Split";

export async function generateMetadata() {
  return { title: (await getTranslations("community.nav"))("board") };
}

/** Gemeinschaft → Pinnwand: the feed in the middle, an opened post with its replies on the right. */
export default async function Board({ searchParams }: PageProps<"/community">) {
  const sp = await searchParams;
  const t = await getTranslations("community");
  const post = typeof sp.post === "string" ? sp.post : null;
  const back = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "post") as [string, string][]);
  return (
    <Split open={!!post}
      list={
        <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
          <h1 className="m-0 text-[22px] font-bold leading-tight">{t("nav.board")}</h1>
          <Pinboard sp={sp} />
        </div>
      }
      detail={post
        ? <><BackToList href={`/community${back.size ? `?${back}` : ""}`} label={t("nav.board")} /><PostThread id={post} /></>
        : <Pick text={t("board.pick")} />} />
  );
}
