import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TodoList } from "@/components/mine/TodoList";
import { BackLink, Page } from "@/components/ui/Page";
import { MineSection } from "@/components/mine/MineSection";
import { ShareBlock } from "@/components/ShareBlock";
import { AccessPanel } from "@/components/refs/AccessPanel";
import { btn } from "@/components/ui/styles";
import { getOrigin } from "@/lib/origin";
import type { AccessGrant, Scope } from "@/lib/actions/share";

type List = { id: string; title: string; read_scope: Scope; write_scope: Scope; owner_id: string; owner: string };

async function load(id: string, linkToken: string | null = null) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  return asViewer(viewer, async (tx) => {
    const [list] = await tx<List[]>`
      select l.id, l.title, l.read_scope, l.write_scope, l.owner_id, p.display_name as owner from public.todo_lists l join public.profiles p on p.id = l.owner_id where l.id = ${id}`;
    if (!list) return null;
    const items = await tx<{ id: string; title: string; done: boolean }[]>`
      select id, title, done_at is not null as done from public.todo_items where list_id = ${id} order by position, created_at`;
    const mine = list.owner_id === session?.profile.id;
    const canWrite = mine || (!!session && (await tx<{ ok: boolean }[]>`select app.object_access('list', ${id}, true) as ok`)[0].ok);
    const link = mine ? (await tx<{ t: string | null }[]>`select app.list_link_token(${id}) as t`)[0].t : null;
    const grants = mine ? await tx<AccessGrant[]>`
      select g.profile_id, p.display_name as name, p.avatar_seed as seed, g.can_write from public.object_grants g join public.profiles p on p.id = g.profile_id
      where g.object_type = 'list' and g.object_id = ${id} order by p.display_name` : [];
    return { list, items, mine, canWrite, link, grants };
  }, { linkToken });
}

export async function generateMetadata({ params }: PageProps<"/me/lists/[id]">) {
  const d = await load((await params).id);
  return { title: d?.list.title ?? "HiveVoice", robots: { index: false } };
}

export default async function ListPage({ params, searchParams }: PageProps<"/me/lists/[id]">) {
  const { id } = await params;
  const k = (await searchParams).k;
  return <MineSection kind="lists" selected={id} open detail={<ListView id={id} linkToken={typeof k === "string" ? k : null} embedded />} />;
}

/** One to-do list; `embedded`: next to the list of lists, without the back link. */
export async function ListView({ id, linkToken = null, embedded = false }: { id: string; linkToken?: string | null; embedded?: boolean }) {
  const d = await load(id, linkToken);
  if (!d) notFound();
  const t = await getTranslations("mine.list");
  const origin = await getOrigin();
  return (
    <Page width="narrow">
      {d.mine
        ? !embedded && <BackLink href="/me/lists" label={t("back")} />
        : <span className="text-sm text-muted">{t("readOnly", { name: d.list.owner })}</span>}
      <TodoList id={d.list.id} title={d.list.title} items={d.items} editable={d.canWrite} owner={d.mine}
        share={d.mine ? (
          <ShareBlock path={`/me/lists/${id}`} title={d.list.title} isPublic={d.list.read_scope === "public"} item={{ type: "list", id }} className={btn.secondarySm}
            access={<AccessPanel bare type="list" id={id} read={d.list.read_scope} write={d.list.write_scope} hasGroup={false}
              linkUrl={d.link ? `${origin}/r/list/${id}?k=${d.link}` : null} grants={d.grants} path={`/me/lists/${id}`} />} />
        ) : undefined} />
    </Page>
  );
}
