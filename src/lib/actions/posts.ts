"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { purgeFiles } from "../storage";
import { MAX_FILES, cleanPoll, pollReady, type PollDraft, type UploadedFile } from "../files";

export async function createPost(input: { body: string; groupId?: string; initiativeId?: string; regionId?: string; parentId?: string; path: string; files?: UploadedFile[]; poll?: PollDraft | null }) {
  const body = input.body.trim();
  const files = (input.files ?? []).slice(0, MAX_FILES);
  const poll = input.poll && pollReady(input.poll) ? cleanPoll(input.poll) : null;
  if (!body && !files.length && !poll) return { ok: false as const, error: "invalid" };
  const res = await run(async (tx, s) => {
    let groupId = input.groupId ?? null, initiativeId = input.initiativeId ?? null, regionId = input.regionId ?? null;
    if (input.parentId) {
      const [parent] = await tx<{ group_id: string | null; initiative_id: string | null; region_id: string | null }[]>`
        select group_id, initiative_id, region_id from public.posts where id = ${input.parentId}`;
      if (!parent) throw new Error("not_found");
      ({ group_id: groupId, initiative_id: initiativeId, region_id: regionId } = parent);
    }
    const [row] = await tx<{ id: string }[]>`
      insert into public.posts (author_id, body, group_id, initiative_id, region_id, parent_id)
      values (${s.profile.id}, ${body.slice(0, 5000)}, ${groupId}, ${initiativeId}, ${regionId}, ${input.parentId ?? null})
      returning id`;
    if (files.length || poll) await tx`select app.add_extras('post', ${row.id}, ${tx.json(files)}, ${poll ? tx.json(poll) : null})`;
    return row.id;
  });
  revalidatePath(input.path.split("?")[0]);
  return res;
}

/** The page is refreshed in the same round trip, so the optimistic vote is replaced by the stored one instead of springing back. */
export async function votePost(postId: string, value: -1 | 0 | 1, path: string) {
  const res = await run(async (tx, s) => {
    if (value === 0) await tx`delete from public.post_votes where post_id = ${postId} and profile_id = ${s.profile.id}`;
    else await tx`insert into public.post_votes (post_id, profile_id, value) values (${postId}, ${s.profile.id}, ${value})
                  on conflict (post_id, profile_id) do update set value = excluded.value`;
    return null;
  });
  revalidatePath(path.split("?")[0]);
  return res;
}

export async function deletePost(postId: string, path: string) {
  let paths: string[] = [];
  const res = await run(async (tx) => {
    paths = (await tx<{ path: string }[]>`select path from public.attachments where post_id = ${postId} or post_id in (select id from public.posts where parent_id = ${postId})`).map((r) => r.path);
    await tx`delete from public.posts where id = ${postId}`;
    return null;
  });
  if (res.ok) await purgeFiles(paths);
  revalidatePath(path.split("?")[0]);
  return res;
}
