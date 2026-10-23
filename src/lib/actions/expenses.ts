"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { purgeFiles } from "../storage";
import type { UploadedFile } from "../files";
import type { Category, Split } from "../split";

export type ExpenseInput = {
  id?: string; groupId: string; kind: "expense" | "payment"; title: string; amountCents: number; currency: string;
  paidBy: string; spentOn: string; split: Split; category: Category; note: string;
  /** Who takes part; `value` is cents, percent or shares depending on the split (left out for an equal split). */
  shares: { profileId: string; value?: number }[];
  files: UploadedFile[];
  /** Receipts to take off the entry. */
  removeFiles: string[];
};

/** Writes down an expense or a payment (settling up), or changes one. */
export async function saveExpense(slug: string, input: ExpenseInput) {
  const res = await run(async (tx) => {
    const gone = input.id && input.removeFiles.length
      ? await tx<{ path: string }[]>`select path from public.attachments where expense_id = ${input.id} and id = any(${input.removeFiles}::uuid[])` : [];
    const [{ id }] = await tx<{ id: string }[]>`select app.save_expense(${tx.json({
      id: input.id ?? null, group_id: input.groupId, kind: input.kind, title: input.title, amount_cents: input.amountCents,
      currency: input.currency, paid_by: input.paidBy, spent_on: input.spentOn, split: input.split, category: input.category, note: input.note,
      shares: input.shares.map((s) => ({ profile_id: s.profileId, value: s.value ?? null })),
      files: input.files, remove_files: input.removeFiles,
    })}) as id`;
    return { id, gone: gone.map((g) => g.path) };
  });
  if (res.ok) await purgeFiles(res.data.gone);
  revalidatePath(`/groups/${slug}`);
  revalidatePath("/friends", "layout");
  return res.ok ? { ok: true as const, data: res.data.id } : res;
}

/** Deletes an entry (it stops counting) or brings it back. */
export async function deleteExpense(slug: string, id: string, restore = false) {
  const res = await run(async (tx) => {
    await tx`select app.delete_expense(${id}, ${restore})`;
    return null;
  });
  revalidatePath(`/groups/${slug}`);
  revalidatePath("/friends", "layout");
  return res;
}
