"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { isRefType, type Ref } from "../refs";

export type ShareTargets = {
  chats: { id: string; title: string }[];
  groups: { id: string; slug: string; name: string }[];
  market: { regionId: string; name: string } | null;
};

/** Where the signed-in person can pass something on: recent chats, groups they may post in, their place's marketplace. */
export async function shareTargets() {
  return run<ShareTargets>(async (tx, s) => {
    const me = s.profile.id;
    const chats = await tx<{ id: string; title: string }[]>`
      select c.id, coalesce(c.title, (select string_agg(p.display_name, ', ') from public.conversation_participants o
                                     join public.profiles p on p.id = o.profile_id where o.conversation_id = c.id and o.profile_id <> ${me})) as title
      from public.conversations c join public.conversation_participants mine on mine.conversation_id = c.id and mine.profile_id = ${me}
      order by c.last_message_at desc limit 20`;
    const groups = await tx<{ id: string; slug: string; name: string }[]>`
      select g.id, g.slug::text, g.name from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.profile_id = ${me} and g.archived_at is null and app.has_group_permission(g.id, 'post') order by g.name`;
    const [market] = await tx<{ regionId: string; name: string }[]>`
      select r.id as "regionId", r.name from public.user_regions ur join public.regions r on r.id = ur.region_id
      where ur.profile_id = ${me} and r.level = 'municipality' limit 1`;
    return { chats: chats.filter((c) => c.title), groups, market: market ?? null };
  });
}

const clean = (ref: Ref) => {
  if (!isRefType(ref.type) || !/^[0-9a-f-]{36}$/.test(ref.id)) throw new Error("invalid");
  return ref;
};

export async function shareToChat(conversationId: string, ref: Ref, note: string) {
  const res = await run(async (tx, s) => {
    const r = clean(ref);
    await tx`insert into public.messages (conversation_id, sender_id, body, ref_type, ref_id)
             values (${conversationId}, ${s.profile.id}, ${note.trim().slice(0, 2000)}, ${r.type}, ${r.id})`;
    return null;
  });
  revalidatePath("/connect");
  return res;
}

/** Into a group: into its collection, and if wanted also as a post in its talk. */
export async function shareToGroup(groupId: string, ref: Ref, note: string, post: boolean) {
  const res = await run(async (tx, s) => {
    const r = clean(ref);
    await tx`insert into public.group_items (group_id, item_type, item_id, added_by, note)
             values (${groupId}, ${r.type}, ${r.id}, ${s.profile.id}, ${note.trim().slice(0, 300) || null}) on conflict do nothing`;
    if (post) await tx`insert into public.posts (author_id, body, group_id, ref_type, ref_id) values (${s.profile.id}, ${note.trim().slice(0, 5000)}, ${groupId}, ${r.type}, ${r.id})`;
    const [g] = await tx<{ slug: string }[]>`select slug::text from public.groups where id = ${groupId}`;
    return g?.slug ?? null;
  });
  if (res.ok && res.data) revalidatePath(`/groups/${res.data}`);
  return res;
}

export async function shareToMarket(regionId: string, ref: Ref, note: string) {
  const res = await run(async (tx, s) => {
    const r = clean(ref);
    await tx`insert into public.posts (author_id, body, region_id, ref_type, ref_id) values (${s.profile.id}, ${note.trim().slice(0, 5000)}, ${regionId}, ${r.type}, ${r.id})`;
    return null;
  });
  revalidatePath("/connect");
  return res;
}

export async function removeFromGroup(groupId: string, ref: Ref) {
  const res = await run(async (tx) => {
    const r = clean(ref);
    await tx`delete from public.group_items where group_id = ${groupId} and item_type = ${r.type} and item_id = ${r.id}`;
    const [g] = await tx<{ slug: string }[]>`select slug::text from public.groups where id = ${groupId}`;
    return g?.slug ?? null;
  });
  if (res.ok && res.data) revalidatePath(`/groups/${res.data}`);
  return res;
}

// ───────────── reading and writing rights of offers, requests and tasks ─────────────
export type Scope = "me" | "people" | "group" | "link" | "public";
export type AccessGrant = { profile_id: string; name: string; seed: number; can_write: boolean };

export async function setAccess(type: "listing" | "task", id: string, read: Scope, write: Scope, path: string) {
  const res = await run(async (tx) => {
    const [{ token }] = await tx<{ token: string | null }[]>`select app.set_object_access(${type}, ${id}, ${read}, ${write}) as token`;
    return token;
  });
  revalidatePath(path);
  return res;
}

export async function grantAccess(type: "listing" | "task", id: string, profileId: string, write: boolean, path: string) {
  const res = await run(async (tx) => {
    await tx`select app.grant_object(${type}, ${id}, ${profileId}, ${write})`;
    return null;
  });
  revalidatePath(path);
  return res;
}

export async function revokeAccess(type: "listing" | "task", id: string, profileId: string, path: string) {
  const res = await run(async (tx) => {
    await tx`select app.revoke_object(${type}, ${id}, ${profileId})`;
    return null;
  });
  revalidatePath(path);
  return res;
}

/** People one may find, for adding them to an object (same limits as the people search). */
export async function findPeople(q: string) {
  return run<{ id: string; name: string; seed: number }[]>(async (tx, s) => {
    if (q.trim().length < 3) return [];
    const [{ ok }] = await tx<{ ok: boolean }[]>`select app.people_search_allowed() as ok`;
    if (!ok) return [];
    return tx<{ id: string; name: string; seed: number }[]>`
      select p.id, p.display_name as name, p.avatar_seed as seed from public.profiles p
      where p.onboarded_at is not null and p.id <> ${s.profile.id} and app.can_find(${s.profile.id}::uuid, p.id)
        and lower(p.display_name) like ${`%${q.trim().toLowerCase()}%`}
      order by p.display_name limit 8`;
  });
}
