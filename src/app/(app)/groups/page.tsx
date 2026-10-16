import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { myRegionIds } from "@/lib/queries";
import { Avatar } from "@/components/ui/Avatar";
import { btn } from "@/components/ui/styles";

export async function generateMetadata() {
  return { title: (await getTranslations("group"))("groups") };
}

type Row = { slug: string; name: string; summary: string | null; member_count: number; region_name: string | null };

export default async function Groups() {
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const t = await getTranslations("group");
  const { mine, near } = await asViewer(viewer, async (tx) => {
    const regions = await myRegionIds(tx, session?.profile.id);
    const mine = session ? await tx<Row[]>`
      select g.slug::text, g.name, g.summary, g.member_count, r.name as region_name from public.group_members m
      join public.groups g on g.id = m.group_id left join public.regions r on r.id = g.region_id
      where m.profile_id = ${session.profile.id} order by m.joined_at desc` : [];
    const near = await tx<Row[]>`
      select g.slug::text, g.name, g.summary, g.member_count, r.name as region_name from public.groups g left join public.regions r on r.id = g.region_id
      where g.archived_at is null and g.visibility = 'public' ${session ? tx`and app.group_role(g.id) is null` : tx``}
      order by (g.region_id = any(${regions}::uuid[])) desc, g.member_count desc limit 30`;
    return { mine, near };
  });
  const row = (g: Row) => (
    <Link key={g.slug} href={`/groups/${g.slug}`} className="flex items-center gap-3 border-b border-line py-3 text-ink no-underline">
      <Avatar name={g.name} size={44} group />
      <span className="flex min-w-0 flex-col">
        <strong>{g.name}</strong>
        <span className="text-sm text-muted">{[g.region_name, t("memberCount", { n: g.member_count })].filter(Boolean).join(" · ")}</span>
        {g.summary && <span className="text-sm">{g.summary}</span>}
      </span>
    </Link>
  );
  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 md:gap-8 md:px-10 md:pb-20 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display m-0">{t("groups")}</h1>
        <Link href="/new/group" className={btn.primaryLg}>+ {t("found")}</Link>
      </div>
      <div className="grid gap-10 md:grid-cols-2">
        {session && (
          <section className="flex flex-col">
            <h2 className="m-0 mb-2 border-b-2 border-ink pb-2 text-lg font-bold">{t("mine")}</h2>
            {mine.length ? mine.map(row) : <p className="text-muted">{t("noneYet")}</p>}
          </section>
        )}
        <section className="flex flex-col">
          <h2 className="m-0 mb-2 border-b-2 border-ink pb-2 text-lg font-bold">{t("nearby")}</h2>
          {near.map(row)}
        </section>
      </div>
    </div>
  );
}
