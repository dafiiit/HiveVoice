import "server-only";
import type { Tx } from "./db";
import type { Message } from "./actions/messages";
import { loadExtras } from "./extras";

type Row = Omit<Message, "reply_to" | "attachments" | "poll"> & { reply_id: string | null; reply_body: string | null; reply_sender: string | null; reply_name: string | null; reply_kind: "text" | "photo" | "file" | "poll" | null };

/** Messages of a conversation with the quoted message, files and poll of each. Everything, only newer ones (polling), or one by id. */
export async function loadMessages(tx: Tx, conversationId: string, opts: { since?: string; id?: string } = {}): Promise<Message[]> {
  const rows = await tx<Row[]>`
    select m.id, m.body, m.created_at, m.edited_at, m.deleted_at, m.sender_id, p.display_name as sender_name, p.avatar_seed as sender_seed, p.avatar_path as sender_path,
      rm.id as reply_id, rm.body as reply_body, rm.sender_id as reply_sender, rp.display_name as reply_name,
      case when rm.id is null then null
           when exists (select 1 from public.attachments a where a.message_id = rm.id and a.mime like 'image/%') then 'photo'
           when exists (select 1 from public.attachments a where a.message_id = rm.id) then 'file'
           when exists (select 1 from public.polls pl where pl.message_id = rm.id) then 'poll'
           else 'text' end as reply_kind
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.messages rm on rm.id = m.reply_to_id
    left join public.profiles rp on rp.id = rm.sender_id
    where m.conversation_id = ${conversationId}
      ${opts.since ? tx`and (m.created_at > ${opts.since} or m.edited_at > ${opts.since} or m.deleted_at > ${opts.since})` : tx``}
      ${opts.id ? tx`and m.id = ${opts.id}` : tx``}
    order by m.created_at`;
  const ex = await loadExtras(tx, "message", rows.map((r) => r.id));
  return rows.map(({ reply_id, reply_body, reply_sender, reply_name, reply_kind, ...m }) => ({
    ...m,
    reply_to: reply_id ? { id: reply_id, body: (reply_body ?? "").slice(0, 200), sender_id: reply_sender ?? "", sender_name: reply_name ?? "", kind: reply_kind ?? "text" } : null,
    attachments: ex.attachments.get(m.id) ?? [],
    poll: ex.polls.get(m.id) ?? null,
  }));
}
