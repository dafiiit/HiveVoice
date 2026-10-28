// A broken connection and the one retry that is safe. Kept apart from db.ts (which needs a live pool) so it can be tested.

/** Errors of a connection that broke or never came up (the pooler drops connections now and then), not of the query. */
const BROKEN = new Set(["CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "EPIPE", "57P01", "08006", "08003", "25P03"]);

export const isBroken = (e: unknown) => !!e && typeof e === "object" && "code" in e && BROKEN.has(String((e as { code: unknown }).code));

/**
 * Runs `work` and, when the connection broke before the work was done (nothing was committed), runs it once more.
 * `work` calls `done` when everything but the commit is over: an error after that point may mean the commit went
 * through, so it is not tried again.
 */
export async function withRetry<T>(work: (done: () => void) => Promise<T>, wait = 200): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let finished = false;
    try {
      return await work(() => { finished = true; });
    } catch (e) {
      if (attempt === 0 && !finished && isBroken(e)) {
        console.warn("database connection lost, trying once more:", (e as { code?: string }).code);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Waits for `work`, and calls `late` once when it takes longer than `ms`. A connection the pooler dropped without telling
 * this side looks alive and never answers; `late` replaces the pool, which ends the waiting work with a broken connection.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number, late: () => void): Promise<T> {
  const timer = setTimeout(late, ms);
  try {
    return await work;
  } finally {
    clearTimeout(timer);
  }
}
