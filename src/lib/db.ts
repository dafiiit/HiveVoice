import "server-only";
import postgres from "postgres";

// How long one request may wait for the database before it fails. A healthy
// pooler answers well within this; a stalled one would otherwise hold the
// request (and its pool slot) forever.
const TIMEOUT_S = Number(process.env.DATABASE_TIMEOUT ?? 15);

// One pooled connection set per server instance. The login role is only a
// member of hivevoice_server: it can call trusted functions and switch to the
// API roles, but owns no tables.
const globalForDb = globalThis as unknown as { dbPool?: postgres.Sql };

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    prepare: false, // transaction pooler
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    idle_timeout: 20,
    connect_timeout: Math.max(1, Math.round(TIMEOUT_S * 2 / 3)),
    onnotice: () => {},
    transform: { undefined: null },
  });
}

function pool() {
  return (globalForDb.dbPool ??= connect());
}

/**
 * Replaces a pool whose connections stopped answering. postgres.js has no
 * timeout for a query on an open connection, so a connection the pooler never
 * answers keeps its slot, and new queries even queue up behind it. Ending the
 * old pool rejects everything still waiting on it; the next query opens fresh
 * connections, so the server serves again as soon as the pooler does.
 */
function reset(old: postgres.Sql) {
  if (globalForDb.dbPool !== old) return; // another request already replaced it
  globalForDb.dbPool = undefined;
  console.error(`Database did not answer within ${TIMEOUT_S}s; reopening the connection pool`);
  old.end({ timeout: 0 }).catch(() => {});
}

/** The current pool. Always use this object, never keep `sql.begin` or similar from an older pool. */
export const sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  apply: (_target, _this, args) => Reflect.apply(pool() as unknown as (...a: unknown[]) => unknown, undefined, args),
  get: (_target, prop) => Reflect.get(pool(), prop),
});

export type Tx = postgres.TransactionSql;

export type Viewer = { authId: string; profileId: string } | null;

/**
 * Runs queries as the given viewer. Row level security applies exactly as it
 * would for a direct API client: the transaction switches to the role
 * "authenticated" (or "anon" for guests) and carries the identity in
 * request.jwt.claims.
 *
 * The whole transaction, including waiting for a connection, has TIMEOUT_S
 * seconds. After that it fails with "db_timeout" and the pool is reopened.
 */
export async function asViewer<T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>, opts?: { linkToken?: string | null }): Promise<T> {
  const db = pool();
  // The database itself gives up a little earlier, so a slow query ends with its own error and the connection stays usable.
  const limit = `${Math.max(1, TIMEOUT_S - 3)}s`;
  const work = db.begin(async (tx) => {
    const role = viewer ? "authenticated" : "anon";
    const claims = viewer ? JSON.stringify({ sub: viewer.authId, profile_id: viewer.profileId, role }) : "{}";
    // A link key opens a document that is shared "with everybody who has the link"; without it that document stays closed.
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', ${role}, true), set_config('app.link_token', ${opts?.linkToken ?? ""}, true),
      set_config('statement_timeout', ${limit}, true), set_config('idle_in_transaction_session_timeout', ${limit}, true)`;
    return fn(tx);
  }) as Promise<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("db_timeout"));
      reset(db);
    }, TIMEOUT_S * 1000);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
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
