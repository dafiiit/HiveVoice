"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { asViewer } from "../db";
import { getSession } from "../session";
import { inspectLink, type Inspection } from "../links/inspect";
import { purgeFiles } from "../storage";
import type { UploadedFile } from "../files";

/** Domains of public bodies (the admin list): links there count as trusted. */
async function officialHosts() {
  const rows = await asViewer(null, (tx) => tx<{ domain: string }[]>`select domain::text from public.official_domains`).catch(() => []);
  return rows.map((r) => r.domain);
}

/** Step one of sharing: check a link and read its preview. Nothing is stored yet. */
export async function previewLink(url: string): Promise<{ ok: true; data: Inspection } | { ok: false; error: string }> {
  if (!(await getSession())) return { ok: false, error: "not_authenticated" };
  return { ok: true, data: await inspectLink(url, await officialHosts()) };
}

export type ShareInput = { url: string; title: string; description: string; tags: string[]; groupId: string | null };

/** Step two: check again on the server (the browser is never trusted) and keep link plus preview details. */
export async function shareLink(input: ShareInput) {
  if (!(await getSession())) return { ok: false as const, error: "not_authenticated" };
  const found = await inspectLink(input.url, await officialHosts());
  if (!found.ok) return { ok: false as const, error: `link_${found.block}` };
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.share_resource(${tx.json({
      url: found.url, host: found.host, provider: found.provider, kind: found.kind, title: input.title, description: input.description,
      preview: found.preview, safety: found.trust, notes: found.notes, tags: input.tags.slice(0, 10), group_id: input.groupId ?? "",
    })}) as id`;
    return id;
  });
  revalidatePath("/explore");
  revalidatePath("/groups", "layout");
  return res;
}

export async function voteResource(id: string, value: -1 | 0 | 1, path: string) {
  const res = await run(async (tx, s) => {
    if (value === 0) await tx`delete from public.resource_votes where resource_id = ${id} and profile_id = ${s.profile.id}`;
    else await tx`insert into public.resource_votes (resource_id, profile_id, value) values (${id}, ${s.profile.id}, ${value})
                  on conflict (resource_id, profile_id) do update set value = excluded.value`;
    return null;
  });
  revalidatePath(path.split("?")[0]);
  return res;
}

export async function deleteResource(id: string) {
  let paths: string[] = [];
  const res = await run(async (tx) => {
    paths = (await tx<{ path: string }[]>`select path from public.attachments where resource_id = ${id}`).map((r) => r.path);
    await tx`delete from public.resources where id = ${id}`;
    return null;
  });
  if (res.ok) await purgeFiles(paths);
  revalidatePath("/explore");
  revalidatePath("/groups", "layout");
  return res;
}

export type FileShareInput = { file: UploadedFile; title: string; description: string; tags: string[]; groupId: string | null };

/** A file the person uploaded into their own folder: the database checks the store, then records it as knowledge. */
export async function shareFile(input: FileShareInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.share_file(${tx.json({
      file: input.file, title: input.title, description: input.description, tags: input.tags.slice(0, 10), group_id: input.groupId ?? "",
    })}) as id`;
    return id;
  });
  revalidatePath("/explore");
  revalidatePath("/groups", "layout");
  return res;
}

export type NoteInput = { id?: string; title: string; description: string; body: string; tags: string[]; groupId: string | null };

/** A Markdown note: new, or a change to one's own. */
export async function saveNote(input: NoteInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.save_note(${tx.json({
      id: input.id ?? "", title: input.title, description: input.description, body: input.body.slice(0, 100000), tags: input.tags.slice(0, 10), group_id: input.groupId ?? "",
    })}) as id`;
    return id;
  });
  revalidatePath("/explore");
  revalidatePath("/groups", "layout");
  if (res.ok) revalidatePath(`/links/${res.data}`);
  return res;
}
