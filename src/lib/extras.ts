import "server-only";
import type { Tx } from "./db";
import type { Attachment, PollView } from "./files";

export type Extras = { attachments: Map<string, Attachment[]>; polls: Map<string, PollView> };

/** Files and polls that belong to the given messages or posts, keyed by the id of the message or post. */
export async function loadExtras(tx: Tx, kind: "message" | "post", ids: string[]): Promise<Extras> {
  const attachments = new Map<string, Attachment[]>();
  const polls = new Map<string, PollView>();
  if (!ids.length) return { attachments, polls };
  const col = kind === "message" ? tx`message_id` : tx`post_id`;
  const files = await tx<(Attachment & { parent: string })[]>`
    select id, name, mime, size_bytes, ${col} as parent from public.attachments where ${col} = any(${ids}::uuid[]) order by created_at, name`;
  for (const f of files) attachments.set(f.parent, [...(attachments.get(f.parent) ?? []), { id: f.id, name: f.name, mime: f.mime, size_bytes: f.size_bytes }]);
  const pollIds = await tx<{ id: string }[]>`select id from public.polls where ${col} = any(${ids}::uuid[])`;
  if (pollIds.length) {
    const [{ v }] = await tx<{ v: (PollView & { message_id: string | null; post_id: string | null })[] }[]>`select app.poll_view(${pollIds.map((p) => p.id)}::uuid[]) as v`;
    for (const p of v) polls.set((kind === "message" ? p.message_id : p.post_id) as string, p);
  }
  return { attachments, polls };
}
