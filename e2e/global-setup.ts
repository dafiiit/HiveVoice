import { warmSession } from "./auth";

// One sign-in for the whole run, before any worker starts: see the note at the top of auth.ts.
export default async function globalSetup() {
  await warmSession();
}
