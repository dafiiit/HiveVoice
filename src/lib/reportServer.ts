import "server-only";
import { sql } from "./db";
import { isPoor, type Report } from "./report";

const release = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "";

/** Counts reports. Never fails and never waits long: reporting a problem must not become one. */
export async function storeReports(reports: Report[]) {
  const work = Promise.all(reports.map((r) => sql`
    select app.client_report(${r.kind}, ${r.name}, ${r.path}, ${r.device}, ${release()}, ${r.detail ?? null}, ${r.value ?? 0}, ${r.kind === "vital" && isPoor(r.name, r.value ?? 0)})`));
  await Promise.race([work, new Promise((done) => setTimeout(done, 3000))]).catch(() => {});
  work.catch(() => {});
}
