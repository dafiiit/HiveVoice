"use server";
import { run } from "../action";

export async function createReport(type: string, id: string, rule: string, note: string) {
  return run(async (tx) => {
    const [{ case_no }] = await tx<{ case_no: string }[]>`select app.create_report(${type}, ${id}, ${rule}::public.report_rule, ${note}) as case_no`;
    return case_no;
  });
}
