"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import { GROUP_TOOLS } from "../group-tools";

/** Switches the tools of a private chat on or off (tasks, documents …); the first one creates its small group. */
export async function setChatTools(conversationId: string, tools: string[]) {
  const clean = tools.filter((x) => (GROUP_TOOLS as readonly string[]).includes(x));
  const res = await run(async (tx) => (await tx<{ s: string | null }[]>`select app.chat_tools(${conversationId}, ${clean}::text[]) as s`)[0].s);
  revalidatePath("/friends");
  return res;
}
