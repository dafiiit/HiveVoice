// Loads demo content (supabase/seed/*.sql, in file name order). Remove it again on the admin page.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is not set');
const sql = postgres(url, { max: 1, ssl: /localhost|sslmode=disable/.test(url) ? false : 'require', onnotice: (n) => console.log(n.message) });
const dir = path.join(process.cwd(), 'supabase', 'seed');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  const text = await readFile(path.join(dir, file), 'utf8');
  console.log(`seed ${file}`);
  if (process.env.MIGRATION_MODE === 'direct') await sql.unsafe(text);
  else await sql`select private.exec(${text})`.catch((e) => { console.error(e.message, e.where?.split('\n').slice(-2).join(' | ')); process.exitCode = 1; });
}
await sql.end();
