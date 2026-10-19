"use server";
import { run } from "../action";
import type { PollView } from "../files";

/** Sets my choice (an empty list takes the vote back) and returns the poll as it stands now. */
export async function votePoll(pollId: string, optionIds: string[]) {
  return run(async (tx) => {
    await tx`select app.vote_poll(${pollId}, ${optionIds}::uuid[])`;
    const [{ v }] = await tx<{ v: PollView[] }[]>`select app.poll_view(${[pollId]}::uuid[]) as v`;
    return v[0] ?? null;
  });
}

/** Ends a poll now: the creator and, in a group, its admins and maintainers. */
export async function closePoll(pollId: string) {
  return run(async (tx) => {
    await tx`select app.close_poll(${pollId})`;
    const [{ v }] = await tx<{ v: PollView[] }[]>`select app.poll_view(${[pollId]}::uuid[]) as v`;
    return v[0] ?? null;
  });
}

export async function deletePoll(pollId: string) {
  return run(async (tx) => { await tx`select app.delete_poll(${pollId})`; return null; });
}
