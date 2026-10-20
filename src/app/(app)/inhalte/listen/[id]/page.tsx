import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TodoList } from "@/components/mine/TodoList";
import { BackLink, Page } from "@/components/ui/Page";

type List = { id: string; title: string; visibility: "me" | "public"; owner_id: string; owner: string };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  return asViewer(viewer, async (tx) => {
    const [list] = await tx<List[]>`
      select l.id, l.title, l.visibility, l.owner_id, p.display_name as owner from public.todo_lists l join public.profiles p on p.id = l.owner_id where l.id = ${id}`;
    if (!list) return null;
    const items = await tx<{ id: string; title: string; done: boolean }[]>`
      select id, title, done_at is not null as done from public.todo_items where list_id = ${id} order by position, created_at`;
    return { list, items, mine: list.owner_id === session?.profile.id };
  });
}

export async function generateMetadata({ params }: PageProps<"/inhalte/listen/[id]">) {
  const d = await load((await params).id);
  return { title: d?.list.title ?? "HiveVoice", robots: { index: false } };
}

export default async function ListPage({ params }: PageProps<"/inhalte/listen/[id]">) {
  const d = await load((await params).id);
  if (!d) notFound();
  const t = await getTranslations("mine.list");
  return (
    <Page width="narrow">
      {d.mine
        ? <BackLink href="/inhalte?f=lists" label={t("back")} />
        : <span className="text-sm text-muted">{t("readOnly", { name: d.list.owner })}</span>}
      <TodoList id={d.list.id} title={d.list.title} visibility={d.list.visibility} items={d.items} editable={d.mine} />
    </Page>
  );
}
