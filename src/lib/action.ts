import "server-only";
import { asViewer, errorCode, type Tx } from "./db";
import { getSession, type Session } from "./session";

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server action as the signed-in person, mapping database errors to codes. */
export async function run<T>(fn: (tx: Tx, session: Session) => Promise<T>): Promise<Result<T>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  try {
    const data = await asViewer({ authId: session.authId, profileId: session.profile.id }, (tx) => fn(tx, session));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorCode(e) };
  }
}
