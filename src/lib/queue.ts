"use client";
// Changes made without a connection wait on the device (IndexedDB) and go out in order once it is back: posts and
// replies, votes on posts, answers to dates, duties. Messages in chats have their own outbox (lib/outbox.ts).
// Each change is sent at most once successfully; one the server refuses (gone, no right) is dropped and reported.
import { createPost, votePost } from "./actions/posts";
import { dutyAction, rsvp } from "./actions/calendar";
import { localAll, localDelete, localPut } from "./localdb";
import { offline } from "./outbox";

const ACTIONS = {
  post: (a: Parameters<typeof createPost>[0]) => createPost(a),
  vote: (a: { postId: string; value: -1 | 0 | 1; path: string }) => votePost(a.postId, a.value, a.path),
  rsvp: (a: { id: string; at: string; status: Parameters<typeof rsvp>[2]; roleId: string | null; note: string; slug: string | null }) =>
    rsvp(a.id, a.at, a.status, a.roleId, a.note, a.slug),
  duty: (a: { id: string; at: string; action: Parameters<typeof dutyAction>[2]; slug: string | null }) => dutyAction(a.id, a.at, a.action, null, "", a.slug),
};
export type QueueKind = keyof typeof ACTIONS;
type Item = { kind: QueueKind; args: unknown; at: string };
type Res = { ok: boolean; error?: string };
export type Sent = Res & { queued?: boolean };

export const QUEUE_EVENT = "hv-queue";
/** What waits, for the banner: the number of changes, and what the last send-out dropped. */
export type QueueDetail = { waiting: number; dropped?: number };

const announce = (d: QueueDetail) => window.dispatchEvent(new CustomEvent<QueueDetail>(QUEUE_EVENT, { detail: d }));
const key = () => `${Date.now().toString(36).padStart(10, "0")}-${Math.random().toString(36).slice(2, 8)}`;

export async function waiting() { return (await localAll<Item>("queue")).length; }

/** Sends the change now; without a connection (or when it is lost on the way) it waits and `queued` is true. */
export async function sendOrQueue<K extends QueueKind>(kind: K, args: Parameters<(typeof ACTIONS)[K]>[0]): Promise<Sent> {
  if (!offline()) {
    try {
      return await (ACTIONS[kind] as (a: unknown) => Promise<Res>)(args);
    } catch { /* no answer: keep it */ }
  }
  await localPut("queue", key(), { kind, args, at: new Date().toISOString() } satisfies Item);
  announce({ waiting: await waiting() });
  return { ok: true, queued: true };
}

let flushing = false;
/** Sends what waits, oldest first; stops at the first change that still finds no connection. */
export async function flushQueue() {
  if (flushing || offline()) return;
  flushing = true;
  let dropped = 0;
  try {
    for (const { key: k, value } of await localAll<Item>("queue")) {
      const action = ACTIONS[value.kind] as ((a: unknown) => Promise<Res>) | undefined;
      if (!action) { await localDelete("queue", k); continue; }
      let res: Res;
      try { res = await action(value.args); } catch { break; }
      if (!res.ok) dropped++;
      await localDelete("queue", k);
    }
  } finally {
    flushing = false;
    announce({ waiting: await waiting(), dropped });
  }
}
