// Applies supabase/migrations/*.sql in order.
// On Supabase the migration login runs each file through private.run_migration
// (security definer, owned by postgres). On a plain Postgres (self-hosting) set
// MIGRATION_MODE=direct and use a superuser URL.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is not set');
const direct = process.env.MIGRATION_MODE === 'direct';
const dir = path.join(process.cwd(), 'supabase', 'migrations');
const sql = postgres(url, { max: 1, ssl: url.includes('localhost') ? false : 'require', onnotice: () => {} });

try {
  if (direct) {
    await sql`create schema if not exists private`;
    await sql`create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  }
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const text = await readFile(path.join(dir, file), 'utf8');
    if (direct) {
      const done = await sql`select 1 from private.schema_migrations where name = ${file}`;
      if (done.length) { console.log(`skip     ${file}`); continue; }
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into private.schema_migrations (name) values (${file})`;
      });
      console.log(`applied  ${file}`);
    } else {
      const [{ result }] = await sql`select private.run_migration(${file}, ${text}) as result`;
      console.log(`${result.padEnd(8)} ${file}`);
    }
  }
} finally {
  await sql.end();
}
