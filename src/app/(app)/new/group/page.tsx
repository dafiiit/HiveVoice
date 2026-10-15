import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { NewGroupFlow } from "@/components/new/NewGroupFlow";

export async function generateMetadata() {
  return { title: (await getTranslations("group"))("form.title") };
}

export default async function NewGroup({ searchParams }: PageProps<"/new/group">) {
  const sp = await searchParams;
  const session = await requireSession("/new/group");
  const t = await getTranslations("group.form");
  const { chain, ideas } = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => ({
    chain: await tx<{ id: string; name: string; level: string }[]>`
      select r.id, r.name, r.level::text from public.user_regions ur join public.regions r on r.id = ur.region_id where ur.profile_id = ${session.profile.id}
      order by array_position(array['borough','municipality','district','state','country'], r.level::text)`,
    ideas: await popularTags(tx),
  }));
  return (
    <div className="flex flex-col gap-8 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0">{t("title")}</h1>
        <p className="m-0 max-w-[640px]">{t("lead")}</p>
      </div>
      <NewGroupFlow chain={chain} ideas={ideas} initial={sp.purpose === "demand" ? "demand" : "project"} />
    </div>
  );
}
