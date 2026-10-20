"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { loadMessages } from "../messages";
import type { RefCard } from "../refs";
import { MAX_FILES, cleanPoll, pollReady, type Attachment, type PollDraft, type PollView, type UploadedFile } from "../files";

export type Message = {
  id: string; body: string; created_at: string; sender_id: string; sender_name: string; sender_seed: number; sender_path: string | null;
  edited_at: string | null; deleted_at: string | null;
  /** The message this one answers, as a short quote. */
  reply_to: { id: string; body: string; sender_id: string; sender_name: string; kind: "text" | "photo" | "file" | "poll" } | null;
  attachments: Attachment[];
  poll: PollView | null;
  /** Something passed on as a card (an offer, a document, a group ...). */
  ref: RefCard | "missing" | null;
};

/** `clientKey` comes from the device: a message sent again after a lost connection is stored only once. */
export type MessageInput = { conversationId: string; body: string; replyToId?: string | null; files?: UploadedFile[]; poll?: PollDraft | null; clientKey?: string | null };

export async function sendMessage(input: MessageInput) {
  const body = input.body.trim().slice(0, 5000);
  const files = (input.files ?? []).slice(0, MAX_FILES);
  const poll = input.poll && pollReady(input.poll) ? cleanPoll(input.poll) : null;
  if (!body && !files.length && !poll) return { ok: false as const, error: "invalid" };
  const key = input.clientKey?.slice(0, 64) || null;
  return run(async (tx, s) => {
    if (key) {
      const [known] = await tx<{ id: string }[]>`select id from public.messages where conversation_id = ${input.conversationId} and sender_id = ${s.profile.id} and client_key = ${key}`;
      if (known) return (await loadMessages(tx, input.conversationId, { id: known.id }))[0];
    }
    const [row] = await tx<{ id: string }[]>`
      insert into public.messages (conversation_id, sender_id, body, reply_to_id, client_key)
      values (${input.conversationId}, ${s.profile.id}, ${body}, ${input.replyToId ?? null}, ${key}) returning id`;
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
    const [read] = await tx<{ at: string | null; now: string }[]>`
      select max(last_read_at) as at, to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as now from public.conversation_participants where conversation_id = ${conversationId} and profile_id <> ${s.profile.id}`;
    return { messages, otherReadAt: read?.at ?? null, asOf: read?.now ?? new Date().toISOString() };
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
