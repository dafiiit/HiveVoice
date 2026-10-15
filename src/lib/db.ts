import "server-only";
import postgres from "postgres";

// One pooled connection set per server instance. The login role is only a
// member of hivevoice_server: it can call trusted functions and switch to the
// API roles, but owns no tables.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    prepare: false, // transaction pooler
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    idle_timeout: 20,
    onnotice: () => {},
    transform: { undefined: null },
  });
}

export const sql = globalForDb.sql ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export type Tx = postgres.TransactionSql;

export type Viewer = { authId: string; profileId: string } | null;

/**
 * Runs queries as the given viewer. Row level security applies exactly as it
 * would for a direct API client: the transaction switches to the role
 * "authenticated" (or "anon" for guests) and carries the identity in
 * request.jwt.claims.
 */
export async function asViewer<T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    const role = viewer ? "authenticated" : "anon";
    const claims = viewer ? JSON.stringify({ sub: viewer.authId, profile_id: viewer.profileId, role }) : "{}";
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', ${role}, true)`;
    return fn(tx);
  }) as Promise<T>;
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
