"use server";
import { run } from "../action";

export async function createReport(type: string, id: string, rule: string, note: string) {
  return run(async (tx) => {
    const [{ case_no }] = await tx<{ case_no: string }[]>`select app.create_report(${type}, ${id}, ${rule}::public.report_rule, ${note}) as case_no`;
    return case_no;
  });
}

/** One appeal for the person concerned: a different jury looks at the case again. */
export async function appealReport(reportId: string, reason: string) {
  return run(async (tx) => {
    const [{ no }] = await tx<{ no: string }[]>`select app.appeal_report(${reportId}, ${reason}) as no`;
    return no;
  });
}
