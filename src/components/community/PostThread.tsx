import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadPosts } from "@/lib/posts";
import { PostList } from "@/components/PostList";
import { Page } from "@/components/ui/Page";

/** One pinboard post with all its replies, on the right of the feed. */
export async function PostThread({ id }: { id: string }) {
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const t = await getTranslations("community.board");
  const posts = /^[0-9a-f-]{36}$/.test(id) ? await asViewer(viewer, (tx) => loadPosts(tx, { postId: id }, viewer?.profileId ?? null)) : [];
  return (
    <Page width="narrow">
      <PostList posts={posts} path={`/community?post=${id}`} canWrite={!!session?.profile.verified} viewerId={viewer?.profileId} empty={t("gone")} repliesOpen />
    </Page>
  );
}
