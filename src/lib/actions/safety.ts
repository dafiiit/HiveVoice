"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { loadMessages } from "../messages";

export async function blockProfile(profileId: string, on: boolean) {
  const res = await run(async (tx) => { await tx`select app.block_profile(${profileId}, ${on})`; return null; });
  revalidatePath("/connect");
  revalidatePath(`/profile/${profileId}`);
  revalidatePath("/me");
  return res;
}

export async function muteChat(conversationId: string, on: boolean) {
  const res = await run(async (tx) => { await tx`select app.mute_conversation(${conversationId}, ${on})`; return null; });
  revalidatePath("/connect");
  return res;
}

export async function hideChat(conversationId: string) {
  const res = await run(async (tx) => { await tx`select app.hide_conversation(${conversationId})`; return null; });
  revalidatePath("/connect");
  return res;
}

/** 7 or 30 days is a proposal until the other person agrees; null turns disappearing messages off. */
export async function proposeTtl(conversationId: string, days: 7 | 30 | null) {
  const res = await run(async (tx) => { await tx`select app.propose_ttl(${conversationId}, ${days})`; return null; });
  revalidatePath("/connect");
  return res;
}

export async function setPrivacy(input: { findable: "all" | "members" | "groups"; contactFrom: "all" | "verified" | "groups" | "none" }) {
  const res = await run(async (tx) => { await tx`select app.set_privacy(${input.findable}, ${input.contactFrom})`; return null; });
  revalidatePath("/me");
  return res;
}

export async function editMessage(conversationId: string, messageId: string, body: string) {
  return run(async (tx) => {
    await tx`select app.edit_message(${messageId}, ${body})`;
    return (await loadMessages(tx, conversationId, { id: messageId }))[0];
  });
}

export async function deleteMessage(conversationId: string, messageId: string, forAll: boolean) {
  return run(async (tx) => {
    await tx`select app.delete_message(${messageId}, ${forAll})`;
    return forAll ? ((await loadMessages(tx, conversationId, { id: messageId }))[0] ?? null) : null;
  });
}

export async function moderatePost(postId: string, action: "remove" | "pin" | "unpin" | "lock" | "unlock", reason: string, path: string) {
  const res = await run(async (tx) => { await tx`select app.moderate_post(${postId}, ${action}, ${reason || null})`; return null; });
  revalidatePath(path.split("?")[0]);
  return res;
}
