import "server-only";
import type { Tx } from "./db";
import type { Attachment } from "./files";
import type { Category, Split } from "./split";

export type ExpenseShare = { profile_id: string; name: string; seed: number; path: string | null; amount_cents: number; input: number | null };
export type ExpenseView = {
  id: string; kind: "expense" | "payment"; title: string; amount_cents: number; currency: string;
  paid_by: string; payer_name: string; spent_on: string; split: Split; category: Category; note: string | null;
  created_by_name: string | null; created_at: string; updated_by_name: string | null; updated_at: string;
  deleted_at: string | null; deleted_by_name: string | null;
  shares: ExpenseShare[]; files: Attachment[];
};
export type Balance = { profile_id: string; currency: string; net: number; name: string; seed: number; path: string | null };
export type Settlement = { from: string; to: string; currency: string; amount: number };
export type ExpenseMember = { id: string; name: string; seed: number; path: string | null };
export type ExpenseBook = { entries: ExpenseView[]; balances: Balance[]; settle: Settlement[]; members: ExpenseMember[]; currency: string };

/** The book of a group: entries (newest first), balances, the payments that even them out and who can take part. */
export async function loadExpenses(tx: Tx, groupId: string): Promise<ExpenseBook> {
  const entries = await tx<ExpenseView[]>`
    select e.id, e.kind, e.title, e.amount_cents::int as amount_cents, e.currency, e.paid_by, pp.display_name as payer_name,
           to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, e.split, e.category, e.note,
           cp.display_name as created_by_name, e.created_at, up.display_name as updated_by_name, e.updated_at,
           e.deleted_at, dp.display_name as deleted_by_name,
           coalesce((select jsonb_agg(jsonb_build_object('profile_id', s.profile_id, 'name', p.display_name, 'seed', p.avatar_seed, 'path', p.avatar_path,
                       'amount_cents', s.amount_cents, 'input', s.input) order by p.display_name)
                     from public.expense_shares s join public.profiles p on p.id = s.profile_id where s.expense_id = e.id), '[]') as shares,
           coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mime', a.mime, 'size_bytes', a.size_bytes) order by a.created_at)
                     from public.attachments a where a.expense_id = e.id), '[]') as files
    from public.expenses e
    join public.profiles pp on pp.id = e.paid_by
    left join public.profiles cp on cp.id = e.created_by
    left join public.profiles up on up.id = e.updated_by
    left join public.profiles dp on dp.id = e.deleted_by
    where e.group_id = ${groupId}
    order by e.spent_on desc, e.created_at desc limit 500`;
  const [{ s }] = await tx<{ s: { balances: Balance[]; settle: Settlement[] } }[]>`select app.expense_summary(${groupId}) as s`;
  const members = await tx<ExpenseMember[]>`
    select p.id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path
    from public.group_members m join public.profiles p on p.id = m.profile_id where m.group_id = ${groupId} order by p.display_name`;
  return { entries, balances: s.balances, settle: s.settle, members, currency: entries.find((e) => !e.deleted_at)?.currency ?? "EUR" };
}
