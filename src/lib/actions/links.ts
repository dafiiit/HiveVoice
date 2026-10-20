"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { asViewer, errorCode } from "../db";
import { createSupabaseServer } from "../supabase/server";
import { FILE_BUCKET } from "../files";
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

/** Into the trash: gone for everybody else at once, restorable for 30 days. */
export async function deleteResource(id: string) {
  const res = await run(async (tx) => { await tx`select app.trash_resource(${id})`; return null; });
  revalidatePath("/explore");
  revalidatePath("/me");
  revalidatePath("/inhalte");
  revalidatePath("/groups", "layout");
  return res;
}

export async function restoreResource(id: string) {
  const res = await run(async (tx) => { await tx`select app.restore_resource(${id})`; return null; });
  revalidatePath("/me");
  revalidatePath("/inhalte");
  revalidatePath("/explore");
  return res;
}

/** From the trash for good, together with the stored files. */
export async function purgeResource(id: string) {
  let paths: string[] = [];
  const res = await run(async (tx) => {
    if (!(await tx`select 1 from public.resources where id = ${id} and trashed_at is not null`).length) throw new Error("forbidden");
    paths = (await tx<{ path: string }[]>`select path from public.attachments where resource_id = ${id}`).map((r) => r.path);
    await tx`delete from public.resources where id = ${id}`;
    return null;
  });
  if (res.ok) await purgeFiles(paths);
  revalidatePath("/me");
  revalidatePath("/inhalte");
  return res;
}

export type FileShareInput = { file: UploadedFile; title: string; description: string; tags: string[]; groupId: string | null; visibility?: string; license?: string };

/** A file the person uploaded into their own folder: the database checks the store, then records it as knowledge. */
export async function shareFile(input: FileShareInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.share_file(${tx.json({
      file: input.file, title: input.title, description: input.description, tags: input.tags.slice(0, 10), group_id: input.groupId ?? "",
    })}) as id`;
    if (input.visibility) {
      await tx`select app.set_resource_access(${id}, ${input.visibility}, 'me', ${input.visibility !== "me" && input.visibility !== "invited"}, ${input.license ?? null})`;
    }
    return id;
  });
  revalidatePath("/explore");
  revalidatePath("/groups", "layout");
  return res;
}

export type NoteInput = { id?: string; title: string; description: string; body: string; tags: string[]; groupId: string | null; note?: string; visibility?: string; license?: string };

/** A Markdown note: new, or a change to one's own. */
export async function saveNote(input: NoteInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.save_note(${tx.json({
      id: input.id ?? "", title: input.title, description: input.description, body: input.body.slice(0, 100000), tags: input.tags.slice(0, 10), group_id: input.groupId ?? "",
      note: input.note ?? "", visibility: input.visibility ?? "", license: input.license ?? "",
    })}) as id`;
    return id;
  });
  revalidatePath("/explore");
  revalidatePath("/groups", "layout");
  if (res.ok) revalidatePath(`/links/${res.data}`);
  return res;
}

const touch = (id: string) => { revalidatePath(`/links/${id}`); revalidatePath("/me");
 revalidatePath("/inhalte"); revalidatePath("/explore"); };

export async function setAccess(id: string, visibility: string, editMode: string, allowDownload: boolean, license: string | null) {
  const res = await run(async (tx) => { await tx`select app.set_resource_access(${id}, ${visibility}, ${editMode}, ${allowDownload}, ${license})`; return null; });
  touch(id);
  return res;
}

export async function renewLink(id: string) {
  const res = await run(async (tx) => { await tx`select app.renew_resource_link(${id})`; return null; });
  touch(id);
  return res;
}

export async function grantAccess(id: string, target: { profileId?: string; groupId?: string }, level: string, expires: string | null) {
  const res = await run(async (tx) => {
    await tx`select app.grant_resource(${id}, ${target.profileId ?? null}, ${target.groupId ?? null}, ${level}, ${expires ? new Date(expires).toISOString() : null}::timestamptz)`;
    return null;
  });
  touch(id);
  return res;
}

export async function revokeGrant(id: string, grantId: string) {
  const res = await run(async (tx) => { await tx`select app.revoke_resource_grant(${grantId})`; return null; });
  touch(id);
  return res;
}

export async function lockResource(id: string) {
  return run(async (tx) => (await tx<{ s: { holder: string; mine: boolean; until: string } | null }[]>`select app.lock_resource(${id}) as s`)[0].s);
}

export async function releaseResource(id: string) {
  return run(async (tx) => { await tx`select app.release_resource(${id})`; return null; });
}

export async function suggestChange(id: string, input: { title: string; description: string; body: string; note: string }) {
  const res = await run(async (tx) => {
    await tx`select app.suggest_change(${id}, ${tx.json({ title: input.title, description: input.description, body: input.body.slice(0, 100000), note: input.note })})`;
    return null;
  });
  touch(id);
  return res;
}

export async function decideSuggestion(id: string, suggestionId: string, accept: boolean) {
  const res = await run(async (tx) => { await tx`select app.decide_suggestion(${suggestionId}, ${accept})`; return null; });
  touch(id);
  return res;
}

export async function restoreVersion(id: string, version: number) {
  const res = await run(async (tx) => { await tx`select app.restore_resource_version(${id}, ${version})`; return null; });
  touch(id);
  return res;
}

export async function commentOn(id: string, body: string) {
  const res = await run(async (tx) => { await tx`select app.comment_resource(${id}, ${body})`; return null; });
  touch(id);
  return res;
}

export async function deleteComment(id: string, commentId: string) {
  const res = await run(async (tx) => { await tx`select app.delete_resource_comment(${commentId})`; return null; });
  touch(id);
  return res;
}

export async function proposeResourceTransfer(id: string, to: string) {
  const res = await run(async (tx) => { await tx`select app.propose_resource_transfer(${id}, ${to})`; return null; });
  touch(id);
  return res;
}

export async function decideResourceTransfer(transferId: string, accept: boolean) {
  const res = await run(async (tx) => { await tx`select app.decide_resource_transfer(${transferId}, ${accept})`; return null; });
  revalidatePath("/me");
  revalidatePath("/inhalte");
  return res;
}

export async function cancelResourceTransfer(transferId: string) {
  const res = await run(async (tx) => { await tx`select app.cancel_resource_transfer(${transferId})`; return null; });
  revalidatePath("/me");
  revalidatePath("/inhalte");
  return res;
}

export async function moveToGroup(id: string, groupId: string | null) {
  const res = await run(async (tx) => { await tx`select app.move_resource_to_group(${id}, ${groupId})`; return null; });
  touch(id);
  return res;
}

/** A copy in one's own Wissen (or a group's). Files are copied in the store too, inside the person's own folder. */
export async function copyResource(id: string, groupId: string | null, keyToken?: string | null) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  const viewer = { authId: session.authId, profileId: session.profile.id };
  const [src] = await asViewer(viewer, (tx) => tx<{ origin: string; path: string | null; name: string | null; mime: string | null; size_bytes: number | null }[]>`
    select r.origin, a.path, a.name, a.mime, a.size_bytes from public.resources r left join public.attachments a on a.resource_id = r.id where r.id = ${id} limit 1`,
    { linkToken: keyToken ?? null });
  if (!src) return { ok: false as const, error: "not_found" };
  let file: UploadedFile | null = null;
  if (src.origin === "file" && src.path && src.name && src.mime && src.size_bytes) {
    const ext = src.path.split(".").pop() ?? "bin";
    const dest = `${session.authId}/${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
    const supabase = await createSupabaseServer();
    const { error } = await supabase.storage.from(FILE_BUCKET).copy(src.path, dest);
    if (error) return { ok: false as const, error: "copy_not_allowed" };
    file = { path: dest, name: src.name, mime: src.mime, size: src.size_bytes };
  }
  const res = await asViewer(viewer, async (tx) => {
    const [{ rid }] = await tx<{ rid: string }[]>`select app.copy_resource(${id}, ${groupId}, ${file ? tx.json(file) : null}) as rid`;
    return rid;
  }, { linkToken: keyToken ?? null }).then((data) => ({ ok: true as const, data })).catch(async (e) => {
    if (file) await purgeFiles([file.path]);
    return { ok: false as const, error: errorCode(e) };
  });
  revalidatePath("/me");
  revalidatePath("/inhalte");
  return res;
}
