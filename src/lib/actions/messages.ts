"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { loadMessages } from "../messages";
import { MAX_FILES, cleanPoll, pollReady, type Attachment, type PollDraft, type PollView, type UploadedFile } from "../files";

export type Message = {
  id: string; body: string; created_at: string; sender_id: string; sender_name: string; sender_seed: number; sender_path: string | null;
  /** The message this one answers, as a short quote. */
  reply_to: { id: string; body: string; sender_id: string; sender_name: string; kind: "text" | "photo" | "file" | "poll" } | null;
  attachments: Attachment[];
  poll: PollView | null;
};

export type MessageInput = { conversationId: string; body: string; replyToId?: string | null; files?: UploadedFile[]; poll?: PollDraft | null };

export async function sendMessage(input: MessageInput) {
  const body = input.body.trim().slice(0, 5000);
  const files = (input.files ?? []).slice(0, MAX_FILES);
  const poll = input.poll && pollReady(input.poll) ? cleanPoll(input.poll) : null;
  if (!body && !files.length && !poll) return { ok: false as const, error: "invalid" };
  return run(async (tx, s) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.messages (conversation_id, sender_id, body, reply_to_id)
      values (${input.conversationId}, ${s.profile.id}, ${body}, ${input.replyToId ?? null}) returning id`;
    if (files.length || poll) await tx`select app.add_extras('message', ${row.id}, ${tx.json(files)}, ${poll ? tx.json(poll) : null})`;
    const [m] = await loadMessages(tx, input.conversationId, { id: row.id });
    return m;
  });
}

/** Polled by the open conversation: new messages since the given time, plus how far the other person has read. */
export async function fetchMessages(conversationId: string, since: string) {
  return run(async (tx, s) => {
    const messages = await loadMessages(tx, conversationId, { since });
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
