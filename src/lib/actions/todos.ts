"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

// Personal to-do lists. Row level security keeps them to the owner; "public" only opens them for reading.
const done = (id?: string) => { revalidatePath("/me"); if (id) revalidatePath(`/me/lists/${id}`); };

export async function createTodoList(title: string) {
  const res = await run(async (tx) => {
    const [l] = await tx<{ id: string }[]>`insert into public.todo_lists (title) values (${title.trim().slice(0, 200)}) returning id`;
    return l.id;
  });
  if (res.ok) done();
  return res;
}

export async function updateTodoList(id: string, patch: { title?: string }) {
  const res = await run(async (tx) => {
    if (patch.title !== undefined) await tx`update public.todo_lists set title = ${patch.title.trim().slice(0, 200)}, updated_at = now() where id = ${id}`;
    return null;
  });
  if (res.ok) done(id);
  return res;
}

export async function deleteTodoList(id: string) {
  const res = await run(async (tx) => { await tx`delete from public.todo_lists where id = ${id}`; return null; });
  if (res.ok) done();
  return res;
}

export async function addTodoItem(listId: string, title: string) {
  const res = await run(async (tx) => {
    const [i] = await tx<{ id: string }[]>`
      insert into public.todo_items (list_id, title, position)
      values (${listId}, ${title.trim().slice(0, 500)}, coalesce((select max(position) + 1 from public.todo_items where list_id = ${listId}), 0)) returning id`;
    return i.id;
  });
  if (res.ok) done(listId);
  return res;
}

export async function setTodoItem(listId: string, id: string, patch: { done?: boolean; title?: string }) {
  const res = await run(async (tx) => {
    if (patch.done !== undefined) await tx`update public.todo_items set done_at = case when ${patch.done} then now() end where id = ${id} and list_id = ${listId}`;
    if (patch.title !== undefined) await tx`update public.todo_items set title = ${patch.title.trim().slice(0, 500)} where id = ${id} and list_id = ${listId}`;
    await tx`update public.todo_lists set updated_at = now() where id = ${listId}`;
    return null;
  });
  if (res.ok) done(listId);
  return res;
}

export async function deleteTodoItem(listId: string, id: string) {
  const res = await run(async (tx) => { await tx`delete from public.todo_items where id = ${id} and list_id = ${listId}`; return null; });
  if (res.ok) done(listId);
  return res;
}
