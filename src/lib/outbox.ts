"use client";
import { sendMessage, type Message } from "./actions/messages";

/**
 * Messages written without a connection wait on the device and go out once the connection is back.
 * Only text waits: photos, files and polls need the server right away. Each message carries a key chosen
 * here, so sending it again after a lost answer stores it once.
 */
export type Queued = { key: string; conversationId: string; body: string; replyToId: string | null; at: string };

const STORE = "hv-outbox";
export const OUTBOX_EVENT = "hv-outbox";
export type OutboxDetail = { key: string; conversationId: string; message?: Message; failed?: boolean };

function read(): Queued[] {
  try { return JSON.parse(localStorage.getItem(STORE) ?? "[]") as Queued[]; } catch { return []; }
}
function write(items: Queued[]) {
  try { localStorage.setItem(STORE, JSON.stringify(items)); } catch { /* storage full or blocked: the message stays in memory only */ }
}

export const queued = (conversationId: string) => read().filter((q) => q.conversationId === conversationId);
export function enqueue(item: Queued) { write([...read().filter((q) => q.key !== item.key), item]); }

/** A failed fetch (no network) throws; an answer from the server, even an error, does not. */
export const offline = () => typeof navigator !== "undefined" && !navigator.onLine;

let flushing = false;
export async function flushOutbox() {
  if (flushing || offline()) return;
  flushing = true;
  try {
    for (const q of read()) {
      let res: Awaited<ReturnType<typeof sendMessage>>;
      try {
        res = await sendMessage({ conversationId: q.conversationId, body: q.body, replyToId: q.replyToId, clientKey: q.key });
      } catch {
        break; // still no connection: try again later, in order
      }
      write(read().filter((x) => x.key !== q.key));
      window.dispatchEvent(new CustomEvent<OutboxDetail>(OUTBOX_EVENT, { detail: res.ok ? { key: q.key, conversationId: q.conversationId, message: res.data } : { key: q.key, conversationId: q.conversationId, failed: true } }));
    }
  } finally {
    flushing = false;
  }
}
