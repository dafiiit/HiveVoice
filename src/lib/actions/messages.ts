"use server";
import { run } from "../action";

export type Message = { id: string; body: string; created_at: string; sender_id: string; sender_name: string; sender_seed: number };

export async function sendMessage(conversationId: string, body: string) {
  return run(async (tx, s) => {
    const [m] = await tx<Message[]>`
      insert into public.messages (conversation_id, sender_id, body) values (${conversationId}, ${s.profile.id}, ${body.trim().slice(0, 5000)})
      returning id, body, created_at, sender_id, ${s.profile.display_name}::text as sender_name, ${s.profile.avatar_seed}::int as sender_seed`;
    return m;
  });
}

/** Polled by the open conversation: new messages since the given time. */
export async function fetchMessages(conversationId: string, since: string) {
  return run(async (tx, s) => {
    const rows = await tx<Message[]>`
      select m.id, m.body, m.created_at, m.sender_id, p.display_name as sender_name, p.avatar_seed as sender_seed
      from public.messages m join public.profiles p on p.id = m.sender_id
      where m.conversation_id = ${conversationId} and m.created_at > ${since} order by m.created_at`;
    if (rows.length) {
      await tx`update public.conversation_participants set last_read_at = now() where conversation_id = ${conversationId} and profile_id = ${s.profile.id}`;
    }
    return rows;
  });
}
