"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

export async function decideJury(caseId: string, choice: "violation" | "no_violation" | "unsure", reason: string) {
  const res = await run(async (tx) => {
    const [{ s }] = await tx<{ s: string }[]>`select app.decide_jury(${caseId}, ${choice}::public.jury_choice, ${reason})::text as s`;
    return s;
  });
  revalidatePath(`/jury/${caseId}`);
  return res;
}

export async function declineJury(caseId: string) {
  const res = await run(async (tx) => {
    await tx`select app.decline_jury(${caseId})`;
    return null;
  });
  revalidatePath("/settings");
  return res;
}
