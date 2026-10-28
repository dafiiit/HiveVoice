import "server-only";
import postgres from "postgres";
import { withDeadline, withRetry } from "./dbRetry";

// One pooled connection set per server instance. The login role is only a
// member of hivevoice_server: it can call trusted functions and switch to the
// API roles, but owns no tables.
const globalForDb = globalThis as unknown as { pool?: postgres.Sql };

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    prepare: false, // transaction pooler
    // A database next to the app (self-hosting, in Docker: ?sslmode=disable) speaks without TLS.
    ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? false : "require",
    idle_timeout: 20,
    // A connection that does not come up within 10 s is given up (and tried once more, see asViewer) instead of hanging a page.
    connect_timeout: 10,
    onnotice: () => {},
    transform: { undefined: null },
  });
}

// Made on the first query, not on import: building the app (which loads every module) needs no database.
let pool: postgres.Sql | null = globalForDb.pool ?? null;
const current = () => {
  if (!pool) {
    pool = connect();
    if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
  }
  return pool;
};

/** Throws the pool away and starts a new one: the old connections are closed at once, work still waiting on them fails. */
function renewPool() {
  const old = pool;
  pool = null;
  current();
  console.warn("database did not answer for 30 s, starting new connections");
  old?.end({ timeout: 0 }).catch(() => {});
}

/** The pool of the moment (it is replaced when its connections stop answering). */
export const sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, self, args) => Reflect.apply(current() as unknown as (...a: unknown[]) => unknown, self, args),
  get: (_t, key) => {
    const p = current();
    const v = (p as unknown as Record<PropertyKey, unknown>)[key];
    return typeof v === "function" ? v.bind(p) : v;
  },
});

/** Longer than any statement may take (20 s), so only connections that stopped answering reach it. */
const DEADLINE_MS = 30_000;

export type Tx = postgres.TransactionSql;

export type Viewer = { authId: string; profileId: string } | null;

/**
 * Runs queries as the given viewer. Row level security applies exactly as it
 * would for a direct API client: the transaction switches to the role
 * "authenticated" (or "anon" for guests) and carries the identity in
 * request.jwt.claims.
 *
 * No page waits for a database that does not answer: a statement takes 20 s at most, waiting for a lock 10 s. A connection
 * that broke before the work was done (so nothing was committed) is replaced and the work is tried once more; one that broke
 * during the commit is not, because it may have gone through. A transaction that has not finished after 30 s is waiting on a
 * connection that is gone: the pool is replaced and the work tried once more on a new connection.
 */
export async function asViewer<T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>, opts?: { linkToken?: string | null }): Promise<T> {
  return withRetry((done) => withDeadline(current().begin(async (tx) => {
    const role = viewer ? "authenticated" : "anon";
    const claims = viewer ? JSON.stringify({ sub: viewer.authId, profile_id: viewer.profileId, role }) : "{}";
    // A link key opens a document that is shared "with everybody who has the link"; without it that document stays closed.
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', ${role}, true), set_config('app.link_token', ${opts?.linkToken ?? ""}, true),
                    set_config('statement_timeout', '20000', true), set_config('lock_timeout', '10000', true)`;
    const result = await fn(tx);
    done();
    return result;
  }) as Promise<T>, DEADLINE_MS, renewPool));
}

/** Maps database exceptions raised by app.* functions to stable error codes. */
export function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const msg = String((e as { message: string }).message);
    if (/^[a-z_]+$/.test(msg)) return msg;
    if ("code" in e && (e as { code: string }).code === "42501") return "forbidden";
    if ("code" in e && (e as { code: string }).code === "23505") return "duplicate";
    if ("code" in e && (e as { code: string }).code === "23514") return "invalid";
    console.error(e);
  }
  return "unknown";
}
