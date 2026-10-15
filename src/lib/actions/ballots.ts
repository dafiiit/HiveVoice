"use server";
import { revalidatePath } from "next/cache";
import { sql, errorCode } from "../db";
import { getSession } from "../session";
import { voterToken } from "../ballot";

export async function castVote(ballotId: string, choice: "yes" | "no" | "abstain", path: string) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    // Runs as the server role: the database checks eligibility, records
    // participation and stores the choice under the token only.
    await sql`select app.cast_vote(${session.profile.id}, ${ballotId}, ${voterToken(session.profile.id, ballotId)}, ${choice})`;
  } catch (e) {
    return { ok: false as const, error: errorCode(e) };
  }
  revalidatePath(path.split("?")[0]);
  return { ok: true as const, data: null };
}
