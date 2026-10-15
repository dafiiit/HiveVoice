"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

export type Message = { id: string; body: string; created_at: string; sender_id: string; sender_name: string; sender_seed: number; sender_path: string | null };

export async function sendMessage(conversationId: string, body: string) {
  return run(async (tx, s) => {
    const [m] = await tx<Message[]>`
      insert into public.messages (conversation_id, sender_id, body) values (${conversationId}, ${s.profile.id}, ${body.trim().slice(0, 5000)})
      returning id, body, created_at, sender_id, ${s.profile.display_name}::text as sender_name, ${s.profile.avatar_seed}::int as sender_seed,
                ${s.profile.avatar_path}::text as sender_path`;
    return m;
  });
}

/** Polled by the open conversation: new messages since the given time, plus how far the other person has read. */
export async function fetchMessages(conversationId: string, since: string) {
  return run(async (tx, s) => {
    const messages = await tx<Message[]>`
      select m.id, m.body, m.created_at, m.sender_id, p.display_name as sender_name, p.avatar_seed as sender_seed, p.avatar_path as sender_path
      from public.messages m join public.profiles p on p.id = m.sender_id
      where m.conversation_id = ${conversationId} and m.created_at > ${since} order by m.created_at`;
    if (messages.length) {
      await tx`update public.conversation_participants set last_read_at = now() where conversation_id = ${conversationId} and profile_id = ${s.profile.id}`;
    }
    const [read] = await tx<{ at: string | null }[]>`
      select max(last_read_at) as at from public.conversation_participants where conversation_id = ${conversationId} and profile_id <> ${s.profile.id}`;
    return { messages, otherReadAt: read?.at ?? null };
  });
}

/** First message to someone without a listing in between. They answer it as a request. */
export async function requestDirect(toId: string, message: string) {
  const res = await run(async (tx) => {
    const [{ r }] = await tx<{ r: { conversation_id?: string; request_id?: string } }[]>`select app.request_direct(${toId}, ${message}) as r`;
    return r;
  });
  revalidatePath("/connect");
  return res;
}
